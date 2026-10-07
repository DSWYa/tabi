// Shared ordering helpers for lists the admin rearranges (itinerary slots, Travel Info sections).
// The database renumbers a group 0..n on every move (see move_itinerary_item / move_travel_section);
// these mirror that so optimistic updates match what the server will store.

/** `ids` with `id` taken out and re-inserted at `index` (clamped), counted among the *other* ids. */
export function placeAt(ids: readonly string[], id: string, index: number): string[] {
  const others = ids.filter((x) => x !== id)
  const pos = Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : others.length, others.length))
  return [...others.slice(0, pos), id, ...others.slice(pos)]
}

/** id → new sort_order (0..n-1) for an ordered list of ids. */
export function renumber(ids: readonly string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, i]))
}

/** Index to send to the server when moving `id` one step up (-1) or down (+1) inside `ids`, or null at an edge. */
export function stepIndex(ids: readonly string[], id: string, dir: -1 | 1): number | null {
  const i = ids.indexOf(id)
  if (i < 0) return null
  const next = i + dir
  return next < 0 || next >= ids.length ? null : next
}
