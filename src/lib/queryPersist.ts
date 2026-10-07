import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Query, QueryClient } from '@tanstack/react-query'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { del, get, set, type UseStore } from 'idb-keyval'

// Offline reading: the TanStack Query cache is saved to IndexedDB (throttled) and restored on start, so the app
// opens with the last data it saw even with no connection. Writes made offline go through the outbox (outbox.ts).

export const CACHE_KEY = 'tabi.queryCache'
/** The whiteboard keeps its own offline copy (read-only when offline; see lib/whiteboard.ts). */
export const OFFLINE_SCENE_KEY = 'tabi.whiteboardScene'
/** Bump when the shape of cached data changes; an old cache is then discarded instead of restored. */
export const CACHE_BUSTER = 'tabi-cache-v1'
/** Data older than this isn't restored. Queries are also kept in memory this long (gcTime), or they'd drop out. */
export const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 14

/** First query-key segments that never go to disk: the family code (admin secret) and the whiteboard scene (big,
 * and it has its own sync rules). */
const NEVER_PERSIST = new Set(['family_invite', 'whiteboard'])

export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  return query.state.status === 'success' && !NEVER_PERSIST.has(String(query.queryKey[0]))
}

/** idb-keyval as the AsyncStorage the persister expects. `store` is only passed by tests. */
export function idbStorage(store?: UseStore) {
  return {
    getItem: async (key: string) => (await get<string>(key, store)) ?? null,
    setItem: (key: string, value: string) => set(key, value, store),
    removeItem: (key: string) => del(key, store),
  }
}

export function createQueryPersister(store?: UseStore) {
  return createAsyncStoragePersister({ storage: idbStorage(store), key: CACHE_KEY, throttleTime: 1000 })
}

export const queryPersister = createQueryPersister()

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
}

// ---- whose cache is it? ---------------------------------------------------------------------
// Every member sees the same trip data, but notifications and "my" rows are personal. If a different account signs
// in on this device (without signing out first), throw the previous account's cache away.

const OWNER_KEY = 'tabi.cacheOwner'

/** Records `uid` as the cache's owner; true when the cache belonged to someone else and must be cleared. */
export function claimCache(uid: string): boolean {
  try {
    const previous = localStorage.getItem(OWNER_KEY)
    localStorage.setItem(OWNER_KEY, uid)
    return previous !== null && previous !== uid
  } catch {
    return false
  }
}

/** Forget everything cached on this device (sign-out, or another account signed in). */
export async function clearPersistedCache(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  try {
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // storage unavailable — nothing to forget
  }
  await Promise.all([queryPersister.removeClient(), del(OFFLINE_SCENE_KEY).catch(() => undefined)])
}
