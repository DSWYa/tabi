import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAuth } from './auth'
import { DAY_SLOTS, type DaySlot, type ReservationStatus } from './constants'
import { parseDateOnly } from './format'
import { friendlyError } from './join'
import { ensureAffected, placesKey } from './places'
import { placeAt } from './reorder'
import { supabase, type Tables } from './supabase'
import { useTrip } from './trip'

// The itinerary: a handful of entries per day, each in a day + slot (morning/afternoon/evening).
// Inside a slot the admin's order (sort_order) wins; times are shown but don't override an order the admin arranged.
// Realtime (useCoreRealtime) invalidates this key on any change.
export const itineraryKey = ['itinerary_items'] as const

export type ItineraryItem = Omit<Tables<'itinerary_items'>, 'slot' | 'reservation_status'> & {
  slot: DaySlot
  reservation_status: ReservationStatus
}

/** Columns the admin fills in on the itinerary form. */
export type ItemInput = Pick<
  ItineraryItem,
  'place_id' | 'title' | 'day' | 'slot' | 'start_time' | 'end_time' | 'notes' | 'reservation_status' | 'reservation_ref' | 'reservation_time'
>

export function useItineraryItems() {
  const { session } = useAuth()
  return useQuery({
    queryKey: itineraryKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('itinerary_items').select('*').order('day').order('sort_order')
      if (error) throw error
      return sortItinerary(data as ItineraryItem[])
    },
  })
}

// ---- ordering ----------------------------------------------------------------

export const SLOT_RANK: Record<DaySlot, number> = { morning: 0, afternoon: 1, evening: 2 }

/** Times used for "what's next" when an item has no start time. */
const SLOT_TIME: Record<DaySlot, string> = { morning: '09:00', afternoon: '13:00', evening: '18:00' }

type Orderable = Pick<ItineraryItem, 'day' | 'slot' | 'start_time' | 'sort_order'> & { id?: string }

/** "YYYY-MM-DD HH:MM" in trip-local time — sortable as a string. */
export function itemSortKey(item: Pick<ItineraryItem, 'day' | 'slot' | 'start_time'>): string {
  return `${item.day} ${(item.start_time ?? SLOT_TIME[item.slot]).slice(0, 5)}`
}

/** Day, then morning → afternoon → evening, then the admin's order (time and id only break ties). */
export function compareItems(a: Orderable, b: Orderable): number {
  return (
    a.day.localeCompare(b.day)
    || SLOT_RANK[a.slot] - SLOT_RANK[b.slot]
    || a.sort_order - b.sort_order
    || itemSortKey(a).localeCompare(itemSortKey(b))
    || (a.id ?? '').localeCompare(b.id ?? '')
  )
}

export function sortItinerary<T extends Orderable>(items: T[]): T[] {
  return [...items].sort(compareItems)
}

/** Stable id for a day + slot group ("2026-11-22|morning"); also the drop-zone id for drag and drop. */
export function groupKey(day: string, slot: DaySlot): string {
  return `${day}|${slot}`
}

export function parseGroupKey(key: string): { day: string; slot: DaySlot } | null {
  const [day, slot] = key.split('|')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '') || !slot || !(slot in SLOT_RANK)) return null
  return { day, slot: slot as DaySlot }
}

/** Items of one day + slot, in display order. */
export function slotItems<T extends Orderable>(items: T[], day: string, slot: DaySlot): T[] {
  return sortItinerary(items.filter((i) => i.day === day && i.slot === slot))
}

/** "2026-11-22" + n days, without time-zone surprises. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const MAX_TRIP_DAYS = 60

/** Every trip day (start..end, even empty ones, so there is somewhere to drop things) plus any day with an entry. */
export function tripDays(start: string | null, end: string | null, items: Pick<ItineraryItem, 'day'>[]): string[] {
  const days = new Set(items.map((i) => i.day))
  if (start) {
    const last = end && end >= start ? end : start
    for (let day = start, n = 0; day <= last && n < MAX_TRIP_DAYS; day = addDays(day, 1), n++) days.add(day)
  }
  return [...days].sort()
}

/**
 * sort_order for a new or re-timed entry: before the first entry in its slot that starts later, otherwise last.
 * Mirrors public.itinerary_sort_order_for().
 */
export function sortOrderFor(items: Orderable[], day: string, slot: DaySlot, start: string | null, excludeId?: string): number {
  const group = items.filter((i) => i.day === day && i.slot === slot && (excludeId === undefined || i.id !== excludeId))
  const norm = (t: string) => t.slice(0, 5)
  const later = start ? group.filter((i) => i.start_time && norm(i.start_time) > norm(start)) : []
  if (later.length === 0) return group.length ? Math.max(...group.map((i) => i.sort_order)) + 1 : 0
  const next = Math.min(...later.map((i) => i.sort_order))
  const before = group.filter((i) => i.sort_order < next)
  return before.length ? (Math.max(...before.map((i) => i.sort_order)) + next) / 2 : next - 1
}

export interface MoveTarget {
  day: string
  slot: DaySlot
  /** Position among the *other* entries of the target slot. */
  index: number
}

/** The itinerary after moving one entry (target slot renumbered 0..n). Mirrors public.move_itinerary_item(). */
export function applyMove<T extends Orderable & { id: string }>(items: T[], id: string, target: MoveTarget): T[] {
  if (!items.some((i) => i.id === id)) return items
  const groupIds = slotItems(items, target.day, target.slot).map((i) => i.id)
  const order = new Map(placeAt(groupIds, id, target.index).map((itemId, n) => [itemId, n]))
  return sortItinerary(
    items.map((i) => (order.has(i.id) ? { ...i, day: target.day, slot: target.slot, sort_order: order.get(i.id)! } : i)),
  )
}

/**
 * Where "Move up" / "Move down" sends an entry: one place within its slot, or across into the neighbouring
 * slot (and day) at the edges, so the buttons alone can rearrange the whole trip. Null at the very ends.
 */
export function stepTarget<T extends Orderable & { id: string }>(items: T[], days: string[], id: string, dir: -1 | 1): MoveTarget | null {
  const item = items.find((i) => i.id === id)
  if (!item) return null
  const group = slotItems(items, item.day, item.slot)
  const index = group.findIndex((i) => i.id === id)
  if (dir === -1 && index > 0) return { day: item.day, slot: item.slot, index: index - 1 }
  if (dir === 1 && index < group.length - 1) return { day: item.day, slot: item.slot, index: index + 1 }

  const groups = days.flatMap((day) => DAY_SLOTS.map((s) => ({ day, slot: s.key as DaySlot })))
  const at = groups.findIndex((g) => g.day === item.day && g.slot === item.slot)
  const neighbour = at < 0 ? undefined : groups[at + dir]
  if (!neighbour) return null
  // Entering from below lands at the end of the earlier slot; from above, at the start of the later one.
  const size = slotItems(items, neighbour.day, neighbour.slot).length
  return { ...neighbour, index: dir === -1 ? size : 0 }
}

// ---- reading -------------------------------------------------------------------

/** Now, as "YYYY-MM-DD HH:MM" on the trip's clock (Tokyo), comparable with itemSortKey. */
export function tripNowKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/** First item that hasn't started yet (trip-local time). */
export function nextItem<T extends Pick<ItineraryItem, 'day' | 'slot' | 'start_time'>>(sorted: T[], nowKey: string): T | null {
  return sorted.find((item) => itemSortKey(item) >= nowKey) ?? null
}

/** Next item that needs or has a reservation. */
export function nextReservation<T extends Pick<ItineraryItem, 'day' | 'slot' | 'start_time' | 'reservation_status'>>(
  sorted: T[],
  nowKey: string,
): T | null {
  return sorted.find((item) => item.reservation_status !== 'none' && itemSortKey(item) >= nowKey) ?? null
}

/** place id → the itinerary items that schedule it. A place with any is "Scheduled" (derived, not a status). */
export function itemsByPlace<T extends Pick<ItineraryItem, 'place_id'>>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    if (!item.place_id) continue
    const list = map.get(item.place_id)
    if (list) list.push(item)
    else map.set(item.place_id, [item])
  }
  return map
}

/** The entry's own title, else its place's name. */
export function itemName(item: Pick<ItineraryItem, 'title' | 'place_id'>, placeName: (id: string) => string | undefined): string {
  return item.title ?? (item.place_id ? placeName(item.place_id) : undefined) ?? 'Untitled stop'
}

export function slotLabel(slot: DaySlot): string {
  return DAY_SLOTS.find((s) => s.key === slot)?.label ?? slot
}

/** "Sun, Nov 22" */
export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return parseDateOnly(day).toLocaleDateString('en-US', opts)
}

/** "09:00", "09:00–11:30", or null. */
export function formatTimeRange(item: Pick<ItineraryItem, 'start_time' | 'end_time'>): string | null {
  if (!item.start_time) return null
  return item.end_time ? `${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}` : item.start_time.slice(0, 5)
}

/** "Sun, Nov 22 · 09:00" (or the slot name when there's no time). */
export function formatItemWhen(item: Pick<ItineraryItem, 'day' | 'slot' | 'start_time'>): string {
  return `${formatDay(item.day)} · ${item.start_time ? item.start_time.slice(0, 5) : slotLabel(item.slot)}`
}

// ---- writing (admin only; RLS enforces it) -------------------------------------

function useItineraryCache() {
  const queryClient = useQueryClient()
  return {
    queryClient,
    async update(change: (rows: ItineraryItem[]) => ItineraryItem[]) {
      await queryClient.cancelQueries({ queryKey: itineraryKey })
      const previous = queryClient.getQueryData<ItineraryItem[]>(itineraryKey)
      queryClient.setQueryData<ItineraryItem[]>(itineraryKey, (rows) => (rows ? sortItinerary(change(rows)) : rows))
      return { previous }
    },
    restore(context: { previous?: ItineraryItem[] } | undefined) {
      if (context?.previous) queryClient.setQueryData(itineraryKey, context.previous)
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: itineraryKey }),
  }
}

/** Client id + where the entry lands in its slot, computed against the cached itinerary. */
export function newItemArgs(items: ItineraryItem[], input: ItemInput) {
  return { id: crypto.randomUUID(), input, sortOrder: sortOrderFor(items, input.day, input.slot, input.start_time) }
}

/** Patch for an edit: a changed day, slot or start time re-places the entry by time; otherwise it keeps its spot. */
export function editPatch(items: ItineraryItem[], before: ItineraryItem, input: ItemInput): Partial<ItineraryItem> {
  const moved = before.day !== input.day || before.slot !== input.slot
    || (before.start_time ?? '').slice(0, 5) !== (input.start_time ?? '').slice(0, 5)
  return moved ? { ...input, sort_order: sortOrderFor(items, input.day, input.slot, input.start_time, before.id) } : { ...input }
}

export function useCreateItem() {
  const cache = useItineraryCache()
  return useMutation({
    mutationFn: async ({ id, input, sortOrder }: { id: string; input: ItemInput; sortOrder: number }) => {
      const { data, error } = await supabase
        .from('itinerary_items')
        .insert({ ...input, id, sort_order: sortOrder })
        .select('*')
        .single()
      if (error) throw error
      return data as ItineraryItem
    },
    onSuccess: (item) =>
      cache.queryClient.setQueryData<ItineraryItem[]>(itineraryKey, (rows) =>
        sortItinerary([...(rows ?? []).filter((r) => r.id !== item.id), item]),
      ),
    // Scheduling a place changes how Current Plans groups it.
    onSettled: () => Promise.all([cache.invalidate(), cache.queryClient.invalidateQueries({ queryKey: placesKey })]),
  })
}

export function useUpdateItem() {
  const cache = useItineraryCache()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ItineraryItem> }) => {
      const { data, error } = await supabase.from('itinerary_items').update(patch).eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'change this itinerary entry')
    },
    onMutate: ({ id, patch }) => cache.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

export function useDeleteItem() {
  const cache = useItineraryCache()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('itinerary_items').delete().eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'delete this itinerary entry')
    },
    onMutate: (id) => cache.update((rows) => rows.filter((r) => r.id !== id)),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

/** Drag/drop and move up/down. Optimistic: the list reorders instantly; the server renumbers the slot. */
export function useMoveItem() {
  const cache = useItineraryCache()
  return useMutation({
    mutationFn: async ({ id, target }: { id: string; target: MoveTarget }) => {
      const { error } = await supabase.rpc('move_itinerary_item', {
        item_id: id, to_day: target.day, to_slot: target.slot, to_index: target.index,
      })
      if (error) throw error
    },
    onMutate: ({ id, target }) => cache.update((rows) => applyMove(rows, id, target)),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

/** Friendly text for itinerary and suggestion errors. */
export function itineraryErrorMessage(error: { code?: string; message?: string; name?: string } | null | undefined): string {
  if (!error) return ''
  const message = error.message ?? ''
  if (error.code === 'not_allowed' || error.name === 'OutboxRefusedError') return message
  if (error.code === '42501' && /suggestion/i.test(message)) return 'Only the admin can review suggestions.'
  if (error.code === '42501') return 'Only the admin can change the itinerary. You can suggest a change instead.'
  if (error.code === 'P0002') return 'That was just removed by someone else.'
  if (error.code === '55000') return 'Someone already reviewed that suggestion.'
  if (error.code === '23514' && /reservation_details/.test(message)) return 'Remove the booking reference and time, or mark a reservation as needed.'
  if (error.code === '23514' && /one_kind/.test(message)) return 'A change to an existing entry can only move it to a new day or time.'
  if (error.code === '23514') return 'Some details are out of range. Check the form and try again.'
  return friendlyError(error)
}

/** 1-based trip day number ("Day 3"), or null outside the trip dates. */
export function dayNumber(day: string, start: string | null, end: string | null): number | null {
  if (!start || day < start || (end && day > end)) return null
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

/** The trip's days (see tripDays) plus a "Day N" lookup, for the itinerary views and forms. */
export function useTripDays() {
  const trip = useTrip()
  const items = useItineraryItems()
  const start = trip.data?.start_date ?? null
  const end = trip.data?.end_date ?? null
  const days = useMemo(() => tripDays(start, end, items.data ?? []), [start, end, items.data])
  const numberOf = useCallback((day: string) => dayNumber(day, start, end), [start, end])
  return { days, numberOf, start, end, isPending: trip.isPending || items.isPending }
}
