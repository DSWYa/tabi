import 'fake-indexeddb/auto'
import { QueryClient } from '@tanstack/react-query'
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { createStore, get } from 'idb-keyval'
import {
  CACHE_BUSTER, CACHE_KEY, CACHE_MAX_AGE, claimCache, clearPersistedCache, createQueryPersister, queryPersister,
  shouldPersistQuery,
} from './queryPersist'

let n = 0
/** A fresh IndexedDB database per test, so tests (and the persister's throttle) never share state. */
function setup() {
  const store = createStore(`tabi-test-${++n}`, 'kv')
  return { store, persister: createQueryPersister(store) }
}

const save = (queryClient: QueryClient, persister: ReturnType<typeof createQueryPersister>, buster = CACHE_BUSTER) =>
  persistQueryClientSave({ queryClient, persister, buster, dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } })

const restore = (queryClient: QueryClient, persister: ReturnType<typeof createQueryPersister>, buster = CACHE_BUSTER) =>
  persistQueryClientRestore({ queryClient, persister, buster, maxAge: CACHE_MAX_AGE })

describe('shouldPersistQuery', () => {
  const q = (key: string, status: 'success' | 'error' | 'pending' = 'success') =>
    ({ queryKey: [key], state: { status } }) as unknown as Parameters<typeof shouldPersistQuery>[0]

  it('keeps trip data for offline reading', () => {
    for (const key of ['places', 'votes', 'itinerary_items', 'travel_sections', 'trip', 'profiles', 'notifications']) {
      expect(shouldPersistQuery(q(key))).toBe(true)
    }
  })
  it('never writes the family code or the whiteboard scene to disk', () => {
    expect(shouldPersistQuery(q('family_invite'))).toBe(false)
    expect(shouldPersistQuery(q('whiteboard'))).toBe(false)
  })
  it('skips failed and unfinished queries', () => {
    expect(shouldPersistQuery(q('places', 'error'))).toBe(false)
    expect(shouldPersistQuery(q('places', 'pending'))).toBe(false)
  })
})

describe('IndexedDB round trip', () => {
  it('restores what was cached, minus what must not be persisted', async () => {
    const { store, persister } = setup()
    const before = new QueryClient()
    before.setQueryData(['places'], [{ id: 'p1', name: 'Senso-ji' }])
    before.setQueryData(['family_invite'], { code: 'SECRET-CODE', enabled: true })
    await save(before, persister)
    expect(typeof (await get(CACHE_KEY, store))).toBe('string')

    const after = new QueryClient()
    await restore(after, persister)
    expect(after.getQueryData(['places'])).toEqual([{ id: 'p1', name: 'Senso-ji' }])
    expect(after.getQueryData(['family_invite'])).toBeUndefined()
  })

  it('discards a cache written by an older app version (buster)', async () => {
    const { store, persister } = setup()
    const before = new QueryClient()
    before.setQueryData(['places'], [{ id: 'p1' }])
    await save(before, persister, 'tabi-cache-v0')

    const after = new QueryClient()
    await restore(after, persister)
    expect(after.getQueryData(['places'])).toBeUndefined()
    expect(await get(CACHE_KEY, store)).toBeUndefined()
  })

  it('discards a cache older than the max age', async () => {
    const { persister } = setup()
    const before = new QueryClient()
    before.setQueryData(['places'], [{ id: 'p1' }])
    await save(before, persister)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + CACHE_MAX_AGE + 60_000)
    try {
      const after = new QueryClient()
      await restore(after, persister)
      expect(after.getQueryData(['places'])).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('cache ownership', () => {
  beforeEach(() => localStorage.clear())

  it('is claimed by the first account without clearing anything', () => {
    expect(claimCache('user-a')).toBe(false)
    expect(claimCache('user-a')).toBe(false)
  })
  it('tells us to clear when another account signs in on the same device', () => {
    claimCache('user-a')
    expect(claimCache('user-b')).toBe(true)
    expect(claimCache('user-b')).toBe(false)
  })
  it('clearPersistedCache empties memory and IndexedDB', async () => {
    const client = new QueryClient()
    client.setQueryData(['places'], [{ id: 'p1' }])
    await persistQueryClientSave({ queryClient: client, persister: queryPersister, buster: CACHE_BUSTER })
    expect(await get(CACHE_KEY)).toBeDefined()
    claimCache('user-a')

    await clearPersistedCache(client)
    expect(client.getQueryData(['places'])).toBeUndefined()
    expect(await get(CACHE_KEY)).toBeUndefined()
    expect(claimCache('user-b')).toBe(false) // nobody owns an empty cache
  })
})
