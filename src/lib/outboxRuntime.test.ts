import 'fake-indexeddb/auto'
import { get, set } from 'idb-keyval'
import { EMPTY_OUTBOX, type OutboxOp } from './outbox'
import { outbox } from './outboxRuntime'

const op: OutboxOp = {
  id: 'op-1', userId: 'me', queuedAt: '2026-11-20T10:00:00Z', label: 'Vote “yes” on “Senso-ji”',
  kind: 'vote', placeId: 'p1', vote: 'yes',
}

describe('the app outbox in IndexedDB', () => {
  afterEach(() => outbox.clear())

  it('writes queued changes to IndexedDB, so they survive closing the app', async () => {
    await outbox.enqueue(op)
    expect(await get('tabi.outbox')).toEqual({ ops: [op], failures: [] })
  })

  it('reads them back on start', async () => {
    await set('tabi.outbox', { ops: [op], failures: [] })
    await outbox.reload()
    expect(outbox.getSnapshot().ops).toEqual([op])
  })

  it('treats unreadable stored data as an empty queue', async () => {
    await set('tabi.outbox', 'garbage')
    await outbox.reload()
    expect(outbox.getSnapshot()).toEqual(EMPTY_OUTBOX)
  })

  it('sign-out clears it', async () => {
    await outbox.enqueue(op)
    await outbox.clear()
    expect(await get('tabi.outbox')).toEqual(EMPTY_OUTBOX)
  })
})
