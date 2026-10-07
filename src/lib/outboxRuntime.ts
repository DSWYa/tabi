import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from './auth'
import { itineraryErrorMessage } from './itinerary'
import {
  applyPlaceOps, applySuggestionOps, applyVoteOps, EMPTY_OUTBOX, isTransientError, Outbox, pendingPlaceIds,
  pendingSuggestionIds, pendingVotePlaceIds, type OutboxOp, type OutboxState, type OutboxStorage,
} from './outbox'
import { ensureAffected, placeErrorMessage, placesKey, votesKey, type Place } from './places'
import { suggestionsKey, type Suggestion } from './suggestions'
import { supabase } from './supabase'
import type { VoteRow } from './votes'

// The app's one outbox: stored in IndexedDB, sent to Supabase, shared safely between tabs (Web Locks + a
// BroadcastChannel), and wired into TanStack Query so a sent entry swaps into the cache without a flicker.

const STORAGE_KEY = 'tabi.outbox'
const LOCK_NAME = 'tabi-outbox'
const REQUEST_TIMEOUT_MS = 20_000
const RETRY_EVERY_MS = 30_000

const idbOutboxStorage: OutboxStorage = {
  async read() {
    try {
      const stored = await get<OutboxState>(STORAGE_KEY)
      return stored && Array.isArray(stored.ops) && Array.isArray(stored.failures) ? stored : EMPTY_OUTBOX
    } catch {
      return EMPTY_OUTBOX
    }
  },
  write: (state) => set(STORAGE_KEY, state),
}

/** The columns a member may set when creating a place (everything else is the server's). */
function placeInsert(row: Place) {
  const { id, name, category, priority, price_jpy, address, website, notes, lat, lng, geocode_status, geocoded_address } = row
  return { id, name, category, priority, price_jpy, address, website, notes, lat, lng, geocode_status, geocoded_address }
}

function suggestionInsert(row: Suggestion) {
  const { id, place_id, item_id, title, day, slot, start_time, note } = row
  return { id, place_id, item_id, title, day, slot, start_time, note }
}

/** Supabase reports errors as values; turn them into throws that keep the HTTP status (for isTransientError). */
function check<T extends { error: unknown; status: number }>(result: T, alreadyThere = false): T {
  const error = result.error as { code?: string } | null
  if (!error) return result
  // A retried insert whose first attempt did land (client-generated id): nothing left to do.
  if (alreadyThere && error.code === '23505') return result
  throw Object.assign(error, { status: result.status })
}

export async function sendOp(op: OutboxOp): Promise<void> {
  const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  switch (op.kind) {
    case 'place.create':
      check(await supabase.from('places').insert(placeInsert(op.row)).abortSignal(timeout()), true)
      return
    case 'place.update': {
      const res = check(await supabase.from('places').update(op.patch).eq('id', op.placeId).select('id').abortSignal(timeout()))
      ensureAffected(res.data, 'edit this place')
      return
    }
    case 'vote':
      if (op.vote === null) {
        check(await supabase.from('votes').delete().eq('place_id', op.placeId).eq('user_id', op.userId).abortSignal(timeout()))
        return
      } else {
        const res = check(
          await supabase
            .from('votes')
            .upsert({ place_id: op.placeId, user_id: op.userId, vote: op.vote }, { onConflict: 'place_id,user_id' })
            .select('place_id')
            .abortSignal(timeout()),
        )
        ensureAffected(res.data, 'vote on this place')
        return
      }
    case 'suggestion.create':
      check(await supabase.from('itinerary_suggestions').insert(suggestionInsert(op.row)).abortSignal(timeout()), true)
      return
  }
}

function describe(op: OutboxOp, error: unknown): string {
  const e = error as { code?: string; message?: string }
  return op.kind === 'suggestion.create' ? itineraryErrorMessage(e) : placeErrorMessage(e)
}

let queryClientRef: QueryClient | null = null

/** Put what was just sent into the raw cache, so the overlay can drop it without the row blinking out. */
function patchCache(op: OutboxOp) {
  const qc = queryClientRef
  if (!qc) return
  if (op.kind === 'place.create' || op.kind === 'place.update') {
    qc.setQueryData<Place[]>(placesKey, (rows) => (rows ? applyPlaceOps(rows, [op]) : rows))
  } else if (op.kind === 'vote') {
    qc.setQueryData<VoteRow[]>(votesKey, (rows) => (rows ? applyVoteOps(rows, [op]) : rows))
  } else {
    qc.setQueryData<Suggestion[]>(suggestionsKey, (rows) => (rows ? applySuggestionOps(rows, [op]) : rows))
  }
  const key = op.kind === 'vote' ? votesKey : op.kind === 'suggestion.create' ? suggestionsKey : placesKey
  void qc.invalidateQueries({ queryKey: key })
}

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tabi-outbox')

const lock =
  typeof navigator !== 'undefined' && navigator.locks
    ? <T,>(fn: () => Promise<T>) => navigator.locks.request(LOCK_NAME, fn) as Promise<T>
    : undefined

export const outbox = new Outbox(idbOutboxStorage, {
  execute: sendOp,
  isTransient: (error) => isTransientError(error, navigator.onLine !== false),
  describe,
  onSynced: patchCache,
  lock,
  onChange: () => channel?.postMessage('changed'),
})

channel?.addEventListener('message', () => void outbox.reload())
void outbox.reload()

// ---- React --------------------------------------------------------------------------------------

export function useOutbox(): OutboxState {
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot)
}

/** What's still waiting to be sent, by kind (for the "Pending sync" badges). */
export function usePendingSync() {
  const { ops } = useOutbox()
  return useMemo(
    () => ({ places: pendingPlaceIds(ops), votes: pendingVotePlaceIds(ops), suggestions: pendingSuggestionIds(ops) }),
    [ops],
  )
}

export function useOutboxSyncing(): boolean {
  return useSyncExternalStore(outbox.subscribe, outbox.isSyncing, outbox.isSyncing)
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/** Mounted once per signed-in member: sends the queue on start, when the connection returns, and every 30 s. */
export function useOutboxSync() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const uid = session?.user.id
  const { ops } = useOutbox()
  const waiting = uid ? ops.some((o) => o.userId === uid) : false

  useEffect(() => {
    queryClientRef = queryClient
  }, [queryClient])

  useEffect(() => {
    if (!uid) return
    const flush = () => {
      if (navigator.onLine !== false) void outbox.flush(uid)
    }
    flush()
    const onVisible = () => document.visibilityState === 'visible' && flush()
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    const timer = waiting ? setInterval(flush, RETRY_EVERY_MS) : null
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      if (timer) clearInterval(timer)
    }
  }, [uid, waiting])
}
