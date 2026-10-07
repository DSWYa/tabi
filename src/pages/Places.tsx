import { clsx } from 'clsx'
import { MapPinPlus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { CategoryChips, StatusChips } from '@/components/places/FilterChips'
import { PlaceCard } from '@/components/places/PlaceCard'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import type { PlaceStatus } from '@/lib/constants'
import { usePlaceBoard } from '@/lib/placeBoard'
import { filterPlaces, hasActiveFilters, NO_FILTERS, PLACE_SORTS, sortPlaces, type PlaceFilters, type PlaceSort } from '@/lib/placeFilters'

export default function Places() {
  const board = usePlaceBoard()
  const sheet = usePlaceSheet()
  const [filters, setFilters] = useState<PlaceFilters>(NO_FILTERS)
  const [sort, setSort] = useState<PlaceSort>('newest')
  const [showCategories, setShowCategories] = useState(false)

  const all = board.places
  const visible = useMemo(() => (all ? sortPlaces(filterPlaces(all, filters), sort) : []), [all, filters, sort])
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<PlaceStatus, number>> = {}
    for (const p of all ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1
    return counts
  }, [all])
  const filtering = hasActiveFilters(filters)

  const addButton = (
    <Button onClick={sheet.createPlace}>
      <MapPinPlus className="size-4" aria-hidden />
      Add place
    </Button>
  )

  return (
    <>
      <PageHeader title="Places" subtitle="Every spot the family has suggested." actions={all?.length ? addButton : undefined} />

      {board.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : board.isError ? (
        <Card>
          <ErrorState message="Couldn't load the places." onRetry={() => void board.refetch()} />
        </Card>
      ) : !all?.length ? (
        <Card>
          <EmptyState
            title="No places added yet"
            message="Suggest the first place to visit in Tokyo — the family can vote on it right away."
            action={addButton}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 animate-rise">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-0 flex-1 basis-60">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
                <label htmlFor="place-search" className="sr-only">Search places</label>
                <input
                  id="place-search"
                  type="search"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search name, address, notes"
                  className={clsx(inputClass, 'pl-10')}
                />
              </div>
              <label htmlFor="place-sort" className="sr-only">Sort places</label>
              <select
                id="place-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as PlaceSort)}
                className={clsx(inputClass, 'w-auto pr-8')}
              >
                {PLACE_SORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <StatusChips value={filters.statuses} onChange={(statuses) => setFilters((f) => ({ ...f, statuses }))} counts={statusCounts} />
            <div>
              <button
                type="button"
                aria-expanded={showCategories}
                onClick={() => setShowCategories((v) => !v)}
                className="min-h-11 text-sm font-bold text-accent-text"
              >
                {showCategories ? 'Hide categories' : `Filter by category${filters.categories.length ? ` (${filters.categories.length})` : ''}`}
              </button>
              {showCategories && (
                <div className="mt-1">
                  <CategoryChips value={filters.categories} onChange={(categories) => setFilters((f) => ({ ...f, categories }))} />
                </div>
              )}
            </div>
          </div>

          <p className="mb-3 flex min-h-11 flex-wrap items-center gap-2 text-sm text-muted" aria-live="polite">
            {filtering ? `${visible.length} of ${all.length} places` : `${all.length} ${all.length === 1 ? 'place' : 'places'}`}
            {filtering && (
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setFilters(NO_FILTERS)}>
                <X className="size-4" aria-hidden />
                Clear filters
              </Button>
            )}
          </p>

          {visible.length === 0 ? (
            <Card>
              <EmptyState mood="sleepy" title="Nothing matches" message="Try a different search or clear the filters." />
            </Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {visible.map((place) => (
                <li key={place.id}>
                  <PlaceCard
                    place={place}
                    addedBy={place.added_by ? board.memberById.get(place.added_by) : undefined}
                    tally={board.tallyOf(place.id)}
                    onOpen={() => sheet.openPlace(place.id)}
                    className="h-full"
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
