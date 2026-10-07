import type { CategoryKey, PlaceStatus } from './constants'
import type { Place } from './places'

export interface PlaceFilters {
  search: string
  statuses: PlaceStatus[] // empty = all
  categories: CategoryKey[] // empty = all
  members: string[] // added_by ids; empty = all
}

export const NO_FILTERS: PlaceFilters = { search: '', statuses: [], categories: [], members: [] }

export type PlaceSort = 'newest' | 'priority' | 'name' | 'price'

export const PLACE_SORTS: { key: PlaceSort; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'priority', label: 'Priority' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'price', label: 'Price (low → high)' },
]

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export function filterPlaces(places: readonly Place[], f: PlaceFilters): Place[] {
  const words = fold(f.search).split(/\s+/).filter(Boolean)
  return places.filter((p) => {
    if (f.statuses.length && !f.statuses.includes(p.status)) return false
    if (f.categories.length && !f.categories.includes(p.category)) return false
    if (f.members.length && !(p.added_by && f.members.includes(p.added_by))) return false
    if (words.length) {
      const haystack = fold([p.name, p.address, p.notes].filter(Boolean).join(' '))
      if (!words.every((w) => haystack.includes(w))) return false
    }
    return true
  })
}

export function sortPlaces(places: readonly Place[], sort: PlaceSort): Place[] {
  const byNewest = (a: Place, b: Place) => b.created_at.localeCompare(a.created_at)
  const compare: Record<PlaceSort, (a: Place, b: Place) => number> = {
    newest: byNewest,
    priority: (a, b) => b.priority - a.priority || byNewest(a, b),
    name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    // Unknown prices sort last.
    price: (a, b) => (a.price_jpy ?? Infinity) - (b.price_jpy ?? Infinity) || a.name.localeCompare(b.name),
  }
  return [...places].sort(compare[sort])
}

export function hasActiveFilters(f: PlaceFilters): boolean {
  return Boolean(f.search.trim() || f.statuses.length || f.categories.length || f.members.length)
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
