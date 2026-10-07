import type { VoteValue } from './constants'
import type { Place, PlacePatch } from './places'
import type { Suggestion } from './suggestions'
import type { VoteRow } from './votes'

// The outbox: writes a member makes (new places, place edits, votes, itinerary suggestions) are queued here first
// and sent in order, so they survive being offline, a reload, or closing the app. Rows carry client-generated UUIDs,
// so sending one twice is harmless (a duplicate insert is treated as "already there"); edits are last-write-wins.
// Until an entry is sent, the app shows it on top of the server data (the "overlay" helpers below).
//
// This file is pure apart from the Outbox class, which only talks to an injected storage + executor
// (IndexedDB + Supabase in outboxRuntime.ts; in-memory fakes in the tests).

interface OpBase {
  /** Outbox entry id (not the row id). */
  id: string
  /** The member who queued it; only they can send it. */
  userId: string
  queuedAt: string
  /** What the "Pending sync" list shows, e.g. `Vote on “Senso-ji”`. */
  label: string
}

export type OutboxOp =
  | (OpBase & { kind: 'place.create'; row: Place })
  | (OpBase & { kind: 'place.update'; placeId: string; patch: PlacePatch })
  | (OpBase & { kind: 'vote'; placeId: string; vote: VoteValue | null })
  | (OpBase & { kind: 'suggestion.create'; row: Suggestion })

/** Something the server refused (not a connection problem): dropped from the queue and reported once. */
export interface OutboxFailure {
  id: string
  label: string
  message: string
  at: string
}

export interface OutboxState {
  ops: OutboxOp[]
  failures: OutboxFailure[]
}

export const EMPTY_OUTBOX: OutboxState = { ops: [], failures: [] }

// ---- queueing --------------------------------------------------------------------------------

/** The place an op is about (null for a suggestion that isn't tied to one). */
export function placeIdOf(op: OutboxOp): string | null {
  switch (op.kind) {
    case 'place.create':
      return op.row.id
    case 'place.update':
    case 'vote':
      return op.placeId
    case 'suggestion.create':
      return op.row.place_id
  }
}

/**
 * Add `op`, folding it into an entry that is already waiting where that keeps the queue short and in order:
 * an edit to a place that hasn't been sent yet becomes part of its creation, repeated edits merge, and only the
 * latest vote per place is kept. Returns the new queue and the id of the entry that now carries the change.
 */
export function addOp(ops: OutboxOp[], op: OutboxOp): { ops: OutboxOp[]; id: string } {
  const sameUser = (o: OutboxOp) => o.userId === op.userId
  if (op.kind === 'place.update') {
    const create = ops.find((o) => sameUser(o) && o.kind === 'place.create' && o.row.id === op.placeId)
    if (create && create.kind === 'place.create') {
      return { ops: ops.map((o) => (o === create ? { ...create, row: { ...create.row, ...op.patch } } : o)), id: create.id }
    }
    const update = ops.find((o) => sameUser(o) && o.kind === 'place.update' && o.placeId === op.placeId)
    if (update && update.kind === 'place.update') {
      return { ops: ops.map((o) => (o === update ? { ...update, patch: { ...update.patch, ...op.patch } } : o)), id: update.id }
    }
  }
  if (op.kind === 'vote') {
    const vote = ops.find((o) => sameUser(o) && o.kind === 'vote' && o.placeId === op.placeId)
    if (vote && vote.kind === 'vote') {
      return { ops: ops.map((o) => (o === vote ? { ...vote, vote: op.vote, label: op.label } : o)), id: vote.id }
    }
  }
  return { ops: [...ops, op], id: op.id }
}

/** Everything queued about a place (used when a not-yet-sent place is deleted: nothing of it needs sending). */
export function opsForPlace(ops: OutboxOp[], placeId: string): OutboxOp[] {
  return ops.filter((o) => placeIdOf(o) === placeId)
}

export function hasPendingCreate(ops: OutboxOp[], placeId: string): boolean {
  return ops.some((o) => o.kind === 'place.create' && o.row.id === placeId)
}

/** Places with an unsent creation or edit (they show a "Pending sync" badge). */
export function pendingPlaceIds(ops: OutboxOp[]): Set<string> {
  return new Set(ops.flatMap((o) => (o.kind === 'place.create' ? [o.row.id] : o.kind === 'place.update' ? [o.placeId] : [])))
}

/** Places where my vote hasn't been sent yet. */
export function pendingVotePlaceIds(ops: OutboxOp[]): Set<string> {
  return new Set(ops.flatMap((o) => (o.kind === 'vote' ? [o.placeId] : [])))
}

export function pendingSuggestionIds(ops: OutboxOp[]): Set<string> {
  return new Set(ops.flatMap((o) => (o.kind === 'suggestion.create' ? [o.row.id] : [])))
}

// ---- overlay: server data + what's still waiting ------------------------------------------------

/** New places first (like the server's newest-first order); unsent edits applied on top. */
export function applyPlaceOps(places: Place[], ops: OutboxOp[]): Place[] {
  if (ops.length === 0) return places
  let result = places
  const created: Place[] = []
  for (const op of ops) {
    if (op.kind === 'place.create' && !result.some((p) => p.id === op.row.id) && !created.some((p) => p.id === op.row.id)) {
      created.unshift(op.row)
    } else if (op.kind === 'place.update') {
      result = result.map((p) => (p.id === op.placeId ? { ...p, ...op.patch } : p))
    }
  }
  return created.length ? [...created, ...result] : result
}

export function applyVoteOps(votes: VoteRow[], ops: OutboxOp[]): VoteRow[] {
  let result = votes
  for (const op of ops) {
    if (op.kind !== 'vote') continue
    result = result.filter((v) => !(v.place_id === op.placeId && v.user_id === op.userId))
    if (op.vote) result = [...result, { place_id: op.placeId, user_id: op.userId, vote: op.vote }]
  }
  return result
}

export function applySuggestionOps(suggestions: Suggestion[], ops: OutboxOp[]): Suggestion[] {
  const fresh = ops.flatMap((o) => (o.kind === 'suggestion.create' && !suggestions.some((s) => s.id === o.row.id) ? [o.row] : []))
  return fresh.length ? [...fresh.reverse(), ...suggestions] : suggestions
}

// ---- errors ---------------------------------------------------------------------------------------

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  name?: string
}

/**
 * Worth trying again later? Connection problems, timeouts, server hiccups and an expired session are; anything the
 * database actually refused (permissions, constraints) is not — retrying would fail the same way.
 */
export function isTransientError(error: unknown, online = true): boolean {
  if (!online) return true
  const e = (error ?? {}) as ErrorLike
  const status = e.status ?? -1
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return true
  if (e.code === 'PGRST301' || e.code === 'PGRST303') return true // JWT expired: the client refreshes it
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true
  return !e.code && /fetch|network|load failed|timed? ?out|offline/i.test(e.message ?? '')
}

// ---- the queue ------------------------------------------------------------------------------------

export interface OutboxStorage {
  read(): Promise<OutboxState>
  write(state: OutboxState): Promise<void>
}

export interface OutboxOptions {
  /** Send one entry to the server; throws on failure. */
  execute: (op: OutboxOp) => Promise<void>
  isTransient?: (error: unknown) => boolean
  /** Friendly text for a refused entry. */
  describe?: (op: OutboxOp, error: unknown) => string
  /** Called right after an entry was sent, before it leaves the queue (lets the app patch its cache: no flicker). */
  onSynced?: (op: OutboxOp) => void
  /** Run `fn` exclusively (across tabs when possible). Defaults to an in-process queue. */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>
  /** Another tab may have changed the stored queue. */
  onChange?: () => void
}

export type SubmitResult = 'synced' | 'queued'

export class OutboxRefusedError extends Error {
  readonly cause: unknown
  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'OutboxRefusedError'
    this.cause = cause
  }
}

export class Outbox {
  private state: OutboxState = EMPTY_OUTBOX
  private listeners = new Set<() => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private flushing: Promise<void> | null = null
  private flushAgain = false
  private syncing = false
  private readonly storage: OutboxStorage
  private readonly opts: OutboxOptions

  constructor(storage: OutboxStorage, opts: OutboxOptions) {
    this.storage = storage
    this.opts = opts
  }

  // -- subscription (useSyncExternalStore) --
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
  getSnapshot = (): OutboxState => this.state
  isSyncing = () => this.syncing

  private emit() {
    for (const listener of this.listeners) listener()
  }

  /** Keep the same snapshot object when nothing changed, so overlays (query `select`s) don't recompute. */
  private adopt(next: OutboxState) {
    if (next !== this.state && JSON.stringify(next) !== JSON.stringify(this.state)) this.state = next
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.opts.lock) return this.opts.lock(fn)
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  /** Read the stored queue (on start, or when another tab changed it). */
  async reload(): Promise<void> {
    await this.exclusive(async () => {
      this.adopt(await this.storage.read())
    })
    this.emit()
  }

  /** Read-modify-write the stored queue under the lock. */
  private async update(change: (state: OutboxState) => OutboxState): Promise<void> {
    await this.exclusive(async () => {
      const next = change(await this.storage.read())
      await this.storage.write(next)
      this.adopt(next)
    })
    this.emit()
    this.opts.onChange?.()
  }

  /** Queue an entry without sending it. Returns the id of the entry that carries it (see addOp). */
  async enqueue(op: OutboxOp): Promise<string> {
    let id = op.id
    await this.update((s) => {
      const added = addOp(s.ops, op)
      id = added.id
      return { ...s, ops: added.ops }
    })
    return id
  }

  /**
   * Queue an entry and try to send everything now. Resolves 'synced' when it reached the server, 'queued' when it's
   * waiting for a connection; rejects with OutboxRefusedError when the server refused it (it's then dropped).
   */
  async submit(op: OutboxOp): Promise<SubmitResult> {
    const id = await this.enqueue(op)
    await this.flush(op.userId)
    const failure = this.state.failures.find((f) => f.id === id)
    if (failure) {
      // The caller shows this error itself, so it doesn't also need to sit in the failures list.
      await this.update((s) => ({ ...s, failures: s.failures.filter((f) => f.id !== id) }))
      throw new OutboxRefusedError(failure.message, failure)
    }
    return this.state.ops.some((o) => o.id === id) ? 'queued' : 'synced'
  }

  /** Send `userId`'s entries in order, stopping at the first connection problem. One flush at a time. */
  flush(userId: string): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true
      return this.flushing
    }
    this.flushing = (async () => {
      this.syncing = true
      this.emit()
      try {
        do {
          this.flushAgain = false
          await this.flushOnce(userId)
        } while (this.flushAgain)
      } finally {
        this.flushing = null
        this.syncing = false
        this.emit()
      }
    })()
    return this.flushing
  }

  private async flushOnce(userId: string): Promise<void> {
    for (;;) {
      // Re-read every round: another tab may have sent or added entries meanwhile.
      const done = await this.exclusive(async () => {
        const stored = await this.storage.read()
        const op = stored.ops.find((o) => o.userId === userId)
        if (!op) {
          this.adopt(stored)
          return true
        }
        let next: OutboxState
        try {
          await this.opts.execute(op)
          this.opts.onSynced?.(op)
          next = { ...stored, ops: stored.ops.filter((o) => o.id !== op.id) }
        } catch (error) {
          if ((this.opts.isTransient ?? isTransientError)(error)) {
            this.adopt(stored)
            return true
          }
          const message = this.opts.describe?.(op, error) ?? (error as Error)?.message ?? 'The server refused this change.'
          next = {
            ops: stored.ops.filter((o) => o.id !== op.id),
            failures: [...stored.failures, { id: op.id, label: op.label, message, at: new Date().toISOString() }].slice(-20),
          }
        }
        await this.storage.write(next)
        this.adopt(next)
        return false
      })
      this.emit()
      if (done) return
      this.opts.onChange?.()
    }
  }

  /** Drop queued entries (e.g. everything about a place deleted before it was ever sent). */
  discard(predicate: (op: OutboxOp) => boolean): Promise<void> {
    return this.update((s) => ({ ...s, ops: s.ops.filter((o) => !predicate(o)) }))
  }

  dismissFailure(id: string): Promise<void> {
    return this.update((s) => ({ ...s, failures: s.failures.filter((f) => f.id !== id) }))
  }

  /** Forget everything (sign-out). */
  clear(): Promise<void> {
    return this.update(() => EMPTY_OUTBOX)
  }
}
