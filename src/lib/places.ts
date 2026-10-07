import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import type { CategoryKey, GeocodeStatus, PlaceStatus, VoteValue } from './constants'
import { friendlyError } from './join'
import { supabase, type Tables } from './supabase'
import type { VoteRow } from './votes'

// The family's whole place list is small (tens to low hundreds of rows), so one query holds it all and
// every page filters client-side. Realtime (useCoreRealtime) invalidates these keys on any change.
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
  return useQuery({
    queryKey: placesKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('places').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Place[]
    },
  })
}

export function useVotes() {
  const { session } = useAuth()
  return useQuery({
    queryKey: votesKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('votes').select('place_id, user_id, vote')
      if (error) throw error
      return data as VoteRow[]
    },
  })
}

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

export function useCreatePlace() {
  const { queryClient, invalidate } = usePlacesCacheUpdater()
  return useMutation({
    mutationFn: async (input: PlaceInput & { lat?: number | null; lng?: number | null }) => {
      // Client-generated id: the form can open the new place right away, and retries stay idempotent.
      const id = crypto.randomUUID()
      const pinned = input.lat != null && input.lng != null
      const { data, error } = await supabase
        .from('places')
        .insert({
          ...input,
          id,
          geocode_status: pinned ? 'manual' : 'pending',
          geocoded_address: pinned ? input.address : null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Place
    },
    // Show it immediately (the detail sheet opens on it); the refetch confirms.
    onSuccess: (place) => queryClient.setQueryData<Place[]>(placesKey, (rows) => (rows ? [place, ...rows] : [place])),
    onSettled: invalidate,
  })
}

export function useUpdatePlace() {
  const cache = usePlacesCacheUpdater()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PlacePatch }) => {
      const { data, error } = await supabase.from('places').update(patch).eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'edit this place')
    },
    onMutate: ({ id, patch }) => cache.patchLocal(id, patch),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
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
      const { data, error } = await supabase.from('places').delete().eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'delete this place')
    },
    onSuccess: (_d, id) => {
      queryClient.setQueryData<Place[]>(placesKey, (rows) => rows?.filter((p) => p.id !== id))
      queryClient.setQueryData<VoteRow[]>(votesKey, (rows) => rows?.filter((v) => v.place_id !== id))
    },
    onSettled: invalidate,
  })
}

/** Cast, change or (with `vote: null`) withdraw my vote. Optimistic; RLS only allows it while the place is awaiting. */
export function useCastVote() {
  const { session } = useAuth()
  const uid = session?.user.id
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ placeId, vote }: { placeId: string; vote: VoteValue | null }) => {
      if (!uid) throw new Error('Not signed in')
      if (vote === null) {
        const { error } = await supabase.from('votes').delete().eq('place_id', placeId).eq('user_id', uid)
        if (error) throw error
        return
      }
      const { data, error } = await supabase
        .from('votes')
        .upsert({ place_id: placeId, user_id: uid, vote }, { onConflict: 'place_id,user_id' })
        .select('place_id')
      if (error) throw error
      ensureAffected(data, 'vote on this place')
    },
    onMutate: async ({ placeId, vote }) => {
      await queryClient.cancelQueries({ queryKey: votesKey })
      const previous = queryClient.getQueryData<VoteRow[]>(votesKey)
      queryClient.setQueryData<VoteRow[]>(votesKey, (rows = []) => {
        const others = rows.filter((v) => !(v.place_id === placeId && v.user_id === uid))
        return vote && uid ? [...others, { place_id: placeId, user_id: uid, vote }] : others
      })
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(votesKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: votesKey }),
  })
}

/** Friendly text for place/vote errors (falls back to the shared auth/RPC wording). */
export function placeErrorMessage(error: { code?: string; message?: string; name?: string } | null | undefined): string {
  if (!error) return ''
  const message = error.message ?? ''
  if (error.code === 'not_allowed') return message
  if (error.code === '42501' && /status/i.test(message)) return 'Only the admin can change a place’s status.'
  if (error.code === '42501' && /votes/i.test(message)) return 'Voting on this place has closed — the admin already decided.'
  if (error.code === '23514' && /website/i.test(message)) return 'The website must start with http:// or https://.'
  if (error.code === '23514') return 'Some details are out of range. Check the form and try again.'
  return friendlyError(error)
}
