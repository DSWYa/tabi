import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import type { DaySlot, SuggestionStatus } from './constants'
import {
  formatDay, formatItemWhen, itemName, itineraryKey, slotLabel, sortItinerary, sortOrderFor, type ItineraryItem,
} from './itinerary'
import type { SuggestionInput } from './itineraryForm'
import { ensureAffected, placesKey, type Place } from './places'
import { supabase, type Tables } from './supabase'

// Members propose itinerary changes; the admin approves (which applies them, atomically, in
// review_itinerary_suggestion) or rejects them. Realtime invalidates this key on any change.
export const suggestionsKey = ['itinerary_suggestions'] as const

export type Suggestion = Omit<Tables<'itinerary_suggestions'>, 'slot' | 'status'> & {
  slot: DaySlot
  status: SuggestionStatus
}

export function useSuggestions() {
  const { session } = useAuth()
  return useQuery({
    queryKey: suggestionsKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('itinerary_suggestions').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Suggestion[]
    },
  })
}

/** Pending first (oldest first — first come, first reviewed), then the reviewed history (newest first). */
export function splitSuggestions(list: Suggestion[]): { pending: Suggestion[]; reviewed: Suggestion[] } {
  const by = (key: 'created_at' | 'reviewed_at', dir: 1 | -1) => (a: Suggestion, b: Suggestion) =>
    dir * (a[key] ?? a.created_at).localeCompare(b[key] ?? b.created_at)
  return {
    pending: list.filter((s) => s.status === 'pending').sort(by('created_at', 1)),
    reviewed: list.filter((s) => s.status !== 'pending').sort(by('reviewed_at', -1)),
  }
}

export interface SuggestionSummary {
  kind: 'new' | 'move'
  /** What would be added or moved. */
  what: string
  /** Where it would go: "Tue, Nov 24 · Evening, 17:00". */
  when: string
  /** For a move: where it is now (null if that entry was deleted). */
  from: string | null
}

/** Plain-language description used on the review cards. */
export function describeSuggestion(
  s: Pick<Suggestion, 'item_id' | 'place_id' | 'title' | 'day' | 'slot' | 'start_time'>,
  items: Pick<ItineraryItem, 'id' | 'title' | 'place_id' | 'day' | 'slot' | 'start_time'>[],
  placeName: (id: string) => string | undefined,
): SuggestionSummary {
  const when = `${formatDay(s.day)} · ${slotLabel(s.slot)}${s.start_time ? `, ${s.start_time.slice(0, 5)}` : ''}`
  if (s.item_id) {
    const item = items.find((i) => i.id === s.item_id)
    return { kind: 'move', what: item ? itemName(item, placeName) : 'An itinerary entry', when, from: item ? formatItemWhen(item) : null }
  }
  return { kind: 'new', what: itemName(s, placeName), when, from: null }
}

/**
 * The itinerary as it will look once the admin approves `s` — the same rules as review_itinerary_suggestion():
 * a new entry goes in by time; a move takes the new day/slot/time and keeps its spot only if nothing changed.
 */
export function previewApproval(items: ItineraryItem[], s: Suggestion, newId: string, adminId: string | null): ItineraryItem[] {
  if (s.item_id) {
    const target = items.find((i) => i.id === s.item_id)
    if (!target) return items
    const sameSpot = target.day === s.day && target.slot === s.slot && target.start_time === s.start_time
    return sortItinerary(
      items.map((i) =>
        i.id !== target.id ? i : {
          ...i,
          day: s.day,
          slot: s.slot,
          start_time: s.start_time,
          end_time: s.start_time === target.start_time ? target.end_time : null,
          sort_order: sameSpot ? target.sort_order : sortOrderFor(items, s.day, s.slot, s.start_time, target.id),
        },
      ),
    )
  }
  const now = new Date().toISOString()
  const created: ItineraryItem = {
    id: newId,
    place_id: s.place_id,
    title: s.title,
    day: s.day,
    slot: s.slot,
    start_time: s.start_time,
    end_time: null,
    sort_order: sortOrderFor(items, s.day, s.slot, s.start_time),
    notes: null,
    reservation_status: 'none',
    reservation_ref: null,
    reservation_time: null,
    created_by: adminId,
    created_at: now,
    updated_at: now,
  }
  return sortItinerary([...items, created])
}

/** Places a member may suggest: anything still in play (not rejected), best first. */
export function suggestablePlaces(places: Place[]): Place[] {
  return places
    .filter((p) => p.status === 'in_plan' || p.status === 'awaiting')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'in_plan' ? -1 : 1) || a.name.localeCompare(b.name))
}

export function useCreateSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SuggestionInput) => {
      const { data, error } = await supabase.from('itinerary_suggestions').insert(input).select('*').single()
      if (error) throw error
      return data as Suggestion
    },
    onSuccess: (row) => queryClient.setQueryData<Suggestion[]>(suggestionsKey, (rows) => [row, ...(rows ?? [])]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: suggestionsKey }),
  })
}

/** The author withdraws a pending suggestion (RLS: own + pending only). */
export function useWithdrawSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('itinerary_suggestions').delete().eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'withdraw this suggestion')
    },
    onSuccess: (_d, id) => queryClient.setQueryData<Suggestion[]>(suggestionsKey, (rows) => rows?.filter((s) => s.id !== id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: suggestionsKey }),
  })
}

/** Admin approve/reject. Optimistic on both the suggestion list and the itinerary. */
export function useReviewSuggestion() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ suggestion, approve, note }: { suggestion: Suggestion; approve: boolean; note: string }) => {
      const { data, error } = await supabase.rpc('review_itinerary_suggestion', {
        suggestion_id: suggestion.id, approve, review_note: note.trim() || undefined,
      })
      if (error) throw error
      return data
    },
    onMutate: async ({ suggestion, approve, note }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: suggestionsKey }),
        queryClient.cancelQueries({ queryKey: itineraryKey }),
      ])
      const previous = {
        suggestions: queryClient.getQueryData<Suggestion[]>(suggestionsKey),
        items: queryClient.getQueryData<ItineraryItem[]>(itineraryKey),
      }
      const now = new Date().toISOString()
      queryClient.setQueryData<Suggestion[]>(suggestionsKey, (rows) =>
        rows?.map((s) =>
          s.id === suggestion.id
            ? { ...s, status: approve ? 'approved' : 'rejected', review_note: note.trim() || null, reviewed_at: now, reviewed_by: session?.user.id ?? null }
            : s,
        ),
      )
      if (approve) {
        queryClient.setQueryData<ItineraryItem[]>(itineraryKey, (rows) =>
          rows ? previewApproval(rows, suggestion, `pending-${suggestion.id}`, session?.user.id ?? null) : rows,
        )
      }
      return previous
    },
    onError: (_e, _v, previous) => {
      if (previous?.suggestions) queryClient.setQueryData(suggestionsKey, previous.suggestions)
      if (previous?.items) queryClient.setQueryData(itineraryKey, previous.items)
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: suggestionsKey }),
        queryClient.invalidateQueries({ queryKey: itineraryKey }),
        // Approving a place that was still awaiting a vote also adds it to the plan.
        queryClient.invalidateQueries({ queryKey: placesKey }),
      ]),
  })
}
