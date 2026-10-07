import {
  addOp, applyPlaceOps, applySuggestionOps, applyVoteOps, EMPTY_OUTBOX, isTransientError, Outbox, OutboxRefusedError,
  pendingPlaceIds, pendingVotePlaceIds, type OutboxOp, type OutboxState, type OutboxStorage,
} from './outbox'
import { newPlaceRow, type Place } from './places'
import { newSuggestionRow } from './suggestions'
import type { VoteRow } from './votes'

const ME = 'user-me'
const OTHER = 'user-other'
let seq = 0
const base = (userId = ME, label = 'change') => ({ id: `op-${++seq}`, userId, queuedAt: new Date().toISOString(), label })

const place = (id: string, name = id): Place =>
  newPlaceRow({ name, category: 'food', priority: 3, price_jpy: null, address: null, website: null, notes: null }, ME, id)

const createOp = (id: string, userId = ME): OutboxOp => ({ ...base(userId, `Add ${id}`), kind: 'place.create', row: place(id) })
const updateOp = (placeId: string, patch: Partial<Place>, userId = ME): OutboxOp => ({ ...base(userId), kind: 'place.update', placeId, patch })
const voteOp = (placeId: string, vote: 'yes' | 'maybe' | 'no' | null, userId = ME): OutboxOp => ({ ...base(userId), kind: 'vote', placeId, vote })
const suggestionOp = (id: string, placeId: string | null = null): OutboxOp => ({
  ...base(),
  kind: 'suggestion.create',
  row: newSuggestionRow({ place_id: placeId, item_id: null, title: placeId ? null : 'Ramen', day: '2026-11-24', slot: 'evening', start_time: null, note: null }, ME, id),
})

describe('addOp (queueing and folding)', () => {
  it('folds an edit of an unsent place into its creation', () => {
    const { ops, id } = addOp([createOp('p1')], updateOp('p1', { name: 'Renamed', priority: 5 }))
    expect(ops).toHaveLength(1)
    expect(id).toBe(ops[0].id)
    expect(ops[0].kind === 'place.create' && ops[0].row).toMatchObject({ id: 'p1', name: 'Renamed', priority: 5 })
  })

  it('merges repeated edits of the same place, keeping their place in line', () => {
    let ops = addOp([], updateOp('p1', { name: 'A' })).ops
    ops = addOp(ops, voteOp('p2', 'yes')).ops
    ops = addOp(ops, updateOp('p1', { notes: 'B' })).ops
    expect(ops.map((o) => o.kind)).toEqual(['place.update', 'vote'])
    expect(ops[0].kind === 'place.update' && ops[0].patch).toEqual({ name: 'A', notes: 'B' })
  })

  it('keeps only the latest vote per place', () => {
    let ops = addOp([], voteOp('p1', 'yes')).ops
    ops = addOp(ops, voteOp('p1', null)).ops
    expect(ops).toHaveLength(1)
    expect(ops[0].kind === 'vote' && ops[0].vote).toBeNull()
  })

  it('never folds one member\'s change into another member\'s entry', () => {
    const ops = addOp([voteOp('p1', 'yes', OTHER)], voteOp('p1', 'no')).ops
    expect(ops).toHaveLength(2)
  })

  it('appends suggestions in order', () => {
    const ops = addOp(addOp([], suggestionOp('s1')).ops, suggestionOp('s2')).ops
    expect(ops.map((o) => o.kind === 'suggestion.create' && o.row.id)).toEqual(['s1', 's2'])
  })
})

describe('overlay', () => {
  it('shows unsent places first (newest first) and applies unsent edits', () => {
    const server = [place('old'), place('older')]
    const shown = applyPlaceOps(server, [createOp('new1'), createOp('new2'), updateOp('old', { name: 'Edited' })])
    expect(shown.map((p) => p.id)).toEqual(['new2', 'new1', 'old', 'older'])
    expect(shown[2].name).toBe('Edited')
    expect(server[0].name).toBe('old') // server data untouched
  })

  it('doesn\'t duplicate a place the server already has', () => {
    expect(applyPlaceOps([place('p1')], [createOp('p1')]).map((p) => p.id)).toEqual(['p1'])
  })

  it('returns the same array when nothing is waiting (stable for React)', () => {
    const server = [place('p1')]
    expect(applyPlaceOps(server, [])).toBe(server)
  })

  it('replaces or withdraws my vote', () => {
    const votes: VoteRow[] = [
      { place_id: 'p1', user_id: ME, vote: 'no' },
      { place_id: 'p1', user_id: OTHER, vote: 'yes' },
      { place_id: 'p2', user_id: ME, vote: 'yes' },
    ]
    const shown = applyVoteOps(votes, [voteOp('p1', 'maybe'), voteOp('p2', null)])
    expect(shown).toContainEqual({ place_id: 'p1', user_id: ME, vote: 'maybe' })
    expect(shown).toContainEqual({ place_id: 'p1', user_id: OTHER, vote: 'yes' })
    expect(shown.some((v) => v.place_id === 'p2')).toBe(false)
  })

  it('lists unsent suggestions first as pending', () => {
    const shown = applySuggestionOps([], [suggestionOp('s1'), suggestionOp('s2')])
    expect(shown.map((s) => [s.id, s.status, s.suggested_by])).toEqual([['s2', 'pending', ME], ['s1', 'pending', ME]])
  })

  it('knows which places are waiting to sync', () => {
    const ops = [createOp('p1'), updateOp('p2', { name: 'x' }), voteOp('p3', 'yes')]
    expect([...pendingPlaceIds(ops)]).toEqual(['p1', 'p2'])
    expect([...pendingVotePlaceIds(ops)]).toEqual(['p3'])
  })
})

describe('isTransientError', () => {
  it.each([
    [{ message: 'TypeError: Failed to fetch', code: '', status: 0 }, true],
    [{ message: 'Bad gateway', status: 502 }, true],
    [{ message: 'JWT expired', code: 'PGRST301', status: 401 }, true],
    [{ name: 'AbortError', message: 'The operation was aborted' }, true],
    [{ message: 'new row violates row-level security policy', code: '42501', status: 403 }, false],
    [{ message: 'violates check constraint', code: '23514', status: 400 }, false],
    [{ message: 'You can\'t edit this place', code: 'not_allowed' }, false],
  ])('%o → %s', (error, transient) => expect(isTransientError(error)).toBe(transient))

  it('treats everything as transient while the browser says it is offline', () => {
    expect(isTransientError({ code: '23514', status: 400 }, false)).toBe(true)
  })
})

// ---- the queue ------------------------------------------------------------------------------------

function memoryStorage(initial: OutboxState = EMPTY_OUTBOX): OutboxStorage & { state: OutboxState } {
  const store = {
    state: structuredClone(initial),
    read: async () => structuredClone(store.state),
    write: async (next: OutboxState) => {
      store.state = structuredClone(next)
    },
  }
  return store
}

const offline = Object.assign(new Error('TypeError: Failed to fetch'), { status: 0, code: '' })
const refused = Object.assign(new Error('violates row-level security'), { status: 403, code: '42501' })

function setup(initial?: OutboxState) {
  const storage = memoryStorage(initial)
  const sent: OutboxOp[] = []
  const synced: OutboxOp[] = []
  const server = { fail: null as Error | null, failFor: new Map<string, Error>() }
  const outbox = new Outbox(storage, {
    execute: async (op) => {
      const error = server.failFor.get(op.kind === 'vote' ? op.placeId : op.id) ?? server.fail
      if (error) throw error
      sent.push(op)
    },
    describe: (op) => `Couldn't save: ${op.label}`,
    onSynced: (op) => synced.push(op),
  })
  return { storage, outbox, sent, synced, server }
}

describe('Outbox', () => {
  it('sends right away when online', async () => {
    const { outbox, sent, synced, storage } = setup()
    expect(await outbox.submit(createOp('p1'))).toBe('synced')
    expect(sent.map((o) => o.kind)).toEqual(['place.create'])
    expect(synced).toHaveLength(1)
    expect(storage.state.ops).toEqual([])
  })

  it('keeps the change (in storage) when offline, and sends it in order later', async () => {
    const { outbox, sent, server, storage } = setup()
    server.fail = offline
    expect(await outbox.submit(createOp('p1'))).toBe('queued')
    expect(await outbox.submit(voteOp('p1', 'yes'))).toBe('queued')
    expect(storage.state.ops.map((o) => o.kind)).toEqual(['place.create', 'vote'])
    expect(outbox.getSnapshot().ops).toHaveLength(2)

    server.fail = null
    await outbox.flush(ME)
    expect(sent.map((o) => o.kind)).toEqual(['place.create', 'vote'])
    expect(outbox.getSnapshot().ops).toEqual([])
  })

  it('survives a reload: a new Outbox on the same storage picks the queue up', async () => {
    const first = setup()
    first.server.fail = offline
    await first.outbox.submit(createOp('p1'))

    const reopened = setup(first.storage.state)
    await reopened.outbox.reload()
    expect(reopened.outbox.getSnapshot().ops).toHaveLength(1)
    await reopened.outbox.flush(ME)
    expect(reopened.sent).toHaveLength(1)
  })

  it('stops at the first connection problem so later changes never overtake earlier ones', async () => {
    const { outbox, sent, server } = setup()
    server.fail = offline
    await outbox.enqueue(createOp('p1'))
    await outbox.enqueue(voteOp('p1', 'yes'))
    await outbox.flush(ME)
    expect(sent).toEqual([])
    expect(outbox.getSnapshot().ops).toHaveLength(2)
  })

  it('reports a refused change to the caller and drops it, without blocking the rest', async () => {
    const { outbox, sent, server } = setup()
    server.failFor.set('closed-place', refused)
    await expect(outbox.submit(voteOp('closed-place', 'yes'))).rejects.toBeInstanceOf(OutboxRefusedError)
    expect(outbox.getSnapshot()).toEqual(EMPTY_OUTBOX) // the caller showed the error; nothing left behind
    expect(await outbox.submit(voteOp('open-place', 'yes'))).toBe('synced')
    expect(sent).toHaveLength(1)
  })

  it('lists refusals found during a background sync until dismissed', async () => {
    const { outbox, sent, server } = setup()
    server.fail = offline
    await outbox.enqueue(voteOp('closed-place', 'yes'))
    await outbox.enqueue(createOp('p2'))
    server.fail = null
    server.failFor.set('closed-place', refused)
    await outbox.flush(ME)

    expect(sent.map((o) => o.kind)).toEqual(['place.create'])
    const [failure] = outbox.getSnapshot().failures
    expect(failure.message).toMatch(/^Couldn't save/)
    await outbox.dismissFailure(failure.id)
    expect(outbox.getSnapshot().failures).toEqual([])
  })

  it('only sends the signed-in member\'s changes', async () => {
    const { outbox, sent } = setup({ ops: [voteOp('p1', 'yes', OTHER)], failures: [] })
    await outbox.flush(ME)
    expect(sent).toEqual([])
    expect(outbox.getSnapshot().ops).toHaveLength(1)
  })

  it('runs one flush at a time', async () => {
    const storage = memoryStorage()
    let running = 0
    let maxRunning = 0
    const outbox = new Outbox(storage, {
      execute: async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise((r) => setTimeout(r, 5))
        running--
      },
    })
    await outbox.enqueue(createOp('a'))
    await outbox.enqueue(createOp('b'))
    await Promise.all([outbox.flush(ME), outbox.flush(ME), outbox.flush(ME)])
    expect(maxRunning).toBe(1)
    expect(outbox.getSnapshot().ops).toEqual([])
  })

  it('discards a never-sent place with everything queued about it', async () => {
    const { outbox, server } = setup()
    server.fail = offline
    await outbox.enqueue(createOp('p1'))
    await outbox.enqueue(voteOp('p1', 'yes'))
    await outbox.enqueue(suggestionOp('s1', 'p1'))
    await outbox.enqueue(createOp('p2'))
    await outbox.discard((o) => (o.kind === 'place.create' ? o.row.id : o.kind === 'suggestion.create' ? o.row.place_id : o.kind === 'vote' ? o.placeId : null) === 'p1')
    expect(outbox.getSnapshot().ops.map((o) => o.kind === 'place.create' && o.row.id)).toEqual(['p2'])
  })

  it('notifies subscribers and can be cleared (sign-out)', async () => {
    const { outbox, server, storage } = setup()
    server.fail = offline
    const listener = vi.fn()
    outbox.subscribe(listener)
    await outbox.enqueue(createOp('p1'))
    expect(listener).toHaveBeenCalled()
    await outbox.clear()
    expect(storage.state).toEqual(EMPTY_OUTBOX)
  })
})

it('keeps the same snapshot when a sync finds nothing new (no needless re-renders)', async () => {
  const storage = memoryStorage()
  const outbox = new Outbox(storage, { execute: async () => {} })
  await outbox.reload()
  const before = outbox.getSnapshot()
  await outbox.flush(ME)
  await outbox.reload()
  expect(outbox.getSnapshot()).toBe(before)
})
