import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuth } from './auth'
import type { CategoryKey, GeocodeStatus, PlaceStatus, VoteValue } from './constants'
import { friendlyError } from './join'
import { applyPlaceOps, applyVoteOps, hasPendingCreate, placeIdOf, type OutboxOp, type SubmitResult } from './outbox'
import { outbox, useOutbox } from './outboxRuntime'
import { supabase, type Tables } from './supabase'
import type { VoteRow } from './votes'

// The family's whole place list is small (tens to low hundreds of rows), so one query holds it all and
// every page filters client-side. Realtime (useCoreRealtime) invalidates these keys on any change.
// New places, edits and votes go through the outbox (works offline); what's still waiting is shown on top of the
// server data via `select`, so it survives refetches and reloads until it's sent.
export const placesKey = ['places'] as const
export const votesKey = ['votes'] as const

export type Place = Omit<Tables<'places'>, 'category' | 'status' | 'geocode_status'> & {
  category: CategoryKey
  status: PlaceStatus
  geocode_status: GeocodeStatus
}

/** Columns a member fills in on the place form. */
export type PlaceInput = Pick<Place, 'name' | 'category' | 'priority' | 'price_jpy' | 'address' | 'website' | 'notes'>
export type PlacePatch = Partial<PlaceInput & Pick<Place, 'lat' | 'lng' | 'geocode_status' | 'geocoded_address'>>

type Member = { id: string; role: string } | null | undefined

/** UX mirror of the RLS rule: the creator or an admin may edit/delete. Postgres has the final say. */
export function canEditPlace(place: Pick<Place, 'added_by'>, me: Member): boolean {
  return Boolean(me && (me.role === 'admin' || place.added_by === me.id))
}

/** Geocoding fields after an edit: a changed address (or name, when there's no address) means a fresh lookup. */
export function geocodeResetFor(before: Pick<Place, 'name' | 'address' | 'geocode_status'>, after: Pick<PlaceInput, 'name' | 'address'>): PlacePatch {
  const addressChanged = (before.address ?? '') !== (after.address ?? '')
  const nameMatters = !after.address && before.name !== after.name
  if (!addressChanged && !nameMatters) return {}
  // A pin placed by hand is the member's call; keep it (they can ask for a new lookup from the pin editor).
  if (before.geocode_status === 'manual') return {}
  return { geocode_status: 'pending', lat: null, lng: null, geocoded_address: null }
}

export function usePlaces() {
  const { session } = useAuth()
  const { ops } = useOutbox()
  const select = useCallback((rows: Place[]) => applyPlaceOps(rows, ops), [ops])
  return useQuery({
    queryKey: placesKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('places').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Place[]
    },
    select,
  })
}

export function useVotes() {
  const { session } = useAuth()
  const { ops } = useOutbox()
  const select = useCallback((rows: VoteRow[]) => applyVoteOps(rows, ops), [ops])
  return useQuery({
    queryKey: votesKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('votes').select('place_id, user_id, vote')
      if (error) throw error
      return data as VoteRow[]
    },
    select,
  })
}

/** Common fields of a new outbox entry. */
export function opBase(userId: string, label: string) {
  return { id: crypto.randomUUID(), userId, queuedAt: new Date().toISOString(), label }
}

/** A place's name for outbox labels, including places that so far only exist in the outbox. */
function placeNameFor(queryClient: ReturnType<typeof useQueryClient>, id: string): string {
  const rows = applyPlaceOps(queryClient.getQueryData<Place[]>(placesKey) ?? [], outbox.getSnapshot().ops)
  return rows.find((p) => p.id === id)?.name ?? 'a place'
}

/** A queued write's outcome: `queued` means it's saved on this device and will be sent when back online. */
export interface Submitted {
  queued: boolean
}

const submitted = (result: SubmitResult): Submitted => ({ queued: result === 'queued' })

/** RLS turns a forbidden UPDATE/DELETE into "0 rows"; surface that as a real error. */
export function ensureAffected(rows: unknown[] | null, what: string) {
  if (!rows || rows.length === 0) {
    throw Object.assign(new Error(`You can't ${what} — it may have been changed or removed.`), { code: 'not_allowed' })
  }
}

function usePlacesCacheUpdater() {
  const queryClient = useQueryClient()
  return {
    queryClient,
    async patchLocal(id: string, patch: Partial<Place>) {
      await queryClient.cancelQueries({ queryKey: placesKey })
      const previous = queryClient.getQueryData<Place[]>(placesKey)
      queryClient.setQueryData<Place[]>(placesKey, (rows) => rows?.map((p) => (p.id === id ? { ...p, ...patch } : p)))
      return { previous }
    },
    restore(context: { previous?: Place[] } | undefined) {
      if (context?.previous) queryClient.setQueryData(placesKey, context.previous)
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: placesKey }),
  }
}

/** The row as the server will create it (status, owner and timestamps are forced by places_guard anyway). */
export function newPlaceRow(input: PlaceInput & { lat?: number | null; lng?: number | null }, uid: string, id: string = crypto.randomUUID()): Place {
  const pinned = input.lat != null && input.lng != null
  const now = new Date().toISOString()
  return {
    ...input,
    id,
    lat: pinned ? input.lat! : null,
    lng: pinned ? input.lng! : null,
    geocode_status: pinned ? 'manual' : 'pending',
    geocoded_address: pinned ? input.address : null,
    status: 'awaiting',
    added_by: uid,
    status_changed_by: null,
    status_changed_at: null,
    created_at: now,
    updated_at: now,
  }
}

/** Add a place. Client-generated id: the sheet can open it right away, offline too; re-sending is harmless. */
export function useCreatePlace() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useMutation({
    mutationFn: async (input: PlaceInput & { lat?: number | null; lng?: number | null }): Promise<Submitted & { place: Place }> => {
      if (!uid) throw new Error('Not signed in')
      const place = newPlaceRow(input, uid)
      const result = await outbox.submit({ ...opBase(uid, `Add “${place.name}”`), kind: 'place.create', row: place })
      return { place, ...submitted(result) }
    },
  })
}

/** Edit a place (owner or admin; RLS decides). Shown immediately; sent now or when back online. */
export function useUpdatePlace() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const uid = session?.user.id
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PlacePatch }): Promise<Submitted> => {
      if (!uid) throw new Error('Not signed in')
      const name = patch.name ?? placeNameFor(queryClient, id)
      return submitted(await outbox.submit({ ...opBase(uid, `Edit “${name}”`), kind: 'place.update', placeId: id, patch }))
    },
  })
}

/** Admin only (enforced by the places_guard trigger): Add to Plan, Reject, Visited, back to voting. */
export function useSetPlaceStatus() {
  const cache = usePlacesCacheUpdater()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PlaceStatus }) => {
      const { data, error } = await supabase.from('places').update({ status }).eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'change this place')
    },
    onMutate: ({ id, status }) => cache.patchLocal(id, { status }),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

export function useDeletePlace() {
  const { queryClient, invalidate } = usePlacesCacheUpdater()
  return useMutation({
    mutationFn: async (id: string) => {
      const about = (o: OutboxOp) => placeIdOf(o) === id
      // Never sent? Then deleting it just means not sending it.
      if (hasPendingCreate(outbox.getSnapshot().ops, id)) return outbox.discard(about)
      const { data, error } = await supabase.from('places').delete().eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'delete this place')
      await outbox.discard(about) // queued edits/votes for it would only fail now
    },
    onSuccess: (_d, id) => {
      queryClient.setQueryData<Place[]>(placesKey, (rows) => rows?.filter((p) => p.id !== id))
      queryClient.setQueryData<VoteRow[]>(votesKey, (rows) => rows?.filter((v) => v.place_id !== id))
    },
    onSettled: invalidate,
  })
}

/** Cast, change or (with `vote: null`) withdraw my vote. Shown immediately; RLS only allows it while the place is awaiting. */
export function useCastVote() {
  const { session } = useAuth()
  const uid = session?.user.id
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ placeId, vote }: { placeId: string; vote: VoteValue | null }): Promise<Submitted> => {
      if (!uid) throw new Error('Not signed in')
      const name = placeNameFor(queryClient, placeId)
      const label = vote ? `Vote “${vote}” on “${name}”` : `Take back vote on “${name}”`
      return submitted(await outbox.submit({ ...opBase(uid, label), kind: 'vote', placeId, vote }))
    },
  })
}

/** Friendly text for place/vote errors (falls back to the shared auth/RPC wording). */
export function placeErrorMessage(error: { code?: string; message?: string; name?: string } | null | undefined): string {
  if (!error) return ''
  const message = error.message ?? ''
  if (error.code === 'not_allowed' || error.name === 'OutboxRefusedError') return message
  if (error.code === '42501' && /status/i.test(message)) return 'Only the admin can change a place’s status.'
  if (error.code === '42501' && /votes/i.test(message)) return 'Voting on this place has closed — the admin already decided.'
  if (error.code === '23514' && /website/i.test(message)) return 'The website must start with http:// or https://.'
  if (error.code === '23514') return 'Some details are out of range. Check the form and try again.'
  return friendlyError(error)
}
