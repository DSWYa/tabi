import { clsx } from 'clsx'
import { Expand, MapPinOff, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CategoryIconSprites } from '@/components/map/CategoryIconSprites'
import { addBaseLayer, clusterIcon, iconMarkup, L, pinIcon } from '@/components/map/leaflet'
import { PageHeader } from '@/components/PageHeader'
import { CategoryChips, MemberChips, StatusChips } from '@/components/places/FilterChips'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import {
  CATEGORIES, categoryByKey, pinColorByKey, placeStatusByKey, type CategoryKey, type PinColorKey, type PlaceStatus,
} from '@/lib/constants'
import { TOKYO_CENTER } from '@/lib/maps'
import { usePlaceBoard } from '@/lib/placeBoard'
import { filterPlaces, hasActiveFilters } from '@/lib/placeFilters'
import type { Place } from '@/lib/places'
import type { Profile } from '@/lib/supabase'

type ColorBy = 'member' | 'category'

/** Pin color for a member without one picked yet (same neutral as the "Other" category). */
const NO_MEMBER_COLOR = categoryByKey.other.color
const DEFAULT_STATUSES: PlaceStatus[] = ['awaiting', 'in_plan', 'visited']
/** Street level: every pin is shown individually from here in. */
const FOCUS_ZOOM = 17

function memberColor(member: Profile | undefined): string {
  return member?.pin_color ? pinColorByKey[member.pin_color as PinColorKey].hex : NO_MEMBER_COLOR
}

function hasPin(p: Place): p is Place & { lat: number; lng: number } {
  return p.lat != null && p.lng != null
}

// Lazy route: Leaflet + markercluster live in this chunk only.
export default function MapPage() {
  const board = usePlaceBoard()
  const sheet = usePlaceSheet()
  const [params, setParams] = useSearchParams()
  const focusId = params.get('focus')

  const [statuses, setStatuses] = useState<PlaceStatus[]>(DEFAULT_STATUSES)
  const [categories, setCategories] = useState<CategoryKey[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [colorBy, setColorBy] = useState<ColorBy>('member')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filters = useMemo(() => ({ search: '', statuses, categories, members }), [statuses, categories, members])
  const filtered = useMemo(() => filterPlaces(board.places ?? [], filters), [board.places, filters])
  const pinned = useMemo(() => filtered.filter(hasPin), [filtered])
  const unpinned = useMemo(() => filtered.filter((p) => !hasPin(p)), [filtered])

  const mapEl = useRef<HTMLDivElement>(null)
  const sprites = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markers = useRef(new Map<string, { marker: L.Marker; signature: string }>())
  const fittedFor = useRef<string | null>(null)
  const openPlace = useRef(sheet.openPlace)
  const focusRef = useRef(focusId)
  useEffect(() => {
    openPlace.current = sheet.openPlace
    focusRef.current = focusId
  })

  const ready = !board.isPending && !board.isError

  // Create the map once.
  useEffect(() => {
    if (!ready || !mapEl.current) return
    const map = L.map(mapEl.current, { zoomControl: true, worldCopyJump: false }).setView([TOKYO_CENTER.lat, TOKYO_CENTER.lng], 11)
    addBaseLayer(map)
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: FOCUS_ZOOM,
      iconCreateFunction: clusterIcon,
    })
    map.addLayer(cluster)
    mapRef.current = map
    clusterRef.current = cluster
    const markerIndex = markers.current
    return () => {
      map.remove()
      mapRef.current = null
      clusterRef.current = null
      markerIndex.clear()
      fittedFor.current = null
    }
  }, [ready])

  // Sync pins with the data, filters and coloring. Incremental (only changed pins are replaced): wiping the
  // cluster layer mid-animation — e.g. right after "Show on map" zooms in — leaves markercluster confused.
  useEffect(() => {
    const map = mapRef.current
    const cluster = clusterRef.current
    if (!map || !cluster) return
    const wanted = new Map<string, { place: (typeof pinned)[number]; signature: string; label: string; fill: string; iconColor: string }>()
    for (const place of pinned) {
      const member = place.added_by ? board.memberById.get(place.added_by) : undefined
      const category = categoryByKey[place.category]
      const fill = colorBy === 'member' ? memberColor(member) : category.color
      const iconColor = colorBy === 'member' ? category.color : fill
      const label = `${place.name} — ${category.label}, ${placeStatusByKey[place.status].label}, added by ${member?.display_name ?? 'a former member'}`
      wanted.set(place.id, { place, label, fill, iconColor, signature: [place.lat, place.lng, fill, iconColor, place.status, label].join('|') })
    }

    const stale: L.Marker[] = []
    for (const [id, entry] of markers.current) {
      if (wanted.get(id)?.signature !== entry.signature) {
        stale.push(entry.marker)
        markers.current.delete(id)
      }
    }
    if (stale.length) cluster.removeLayers(stale)

    const added: L.Marker[] = []
    for (const [id, { place, label, fill, iconColor, signature }] of wanted) {
      if (markers.current.has(id)) continue
      const marker = L.marker([place.lat, place.lng], {
        icon: pinIcon({
          fill,
          icon: iconMarkup(sprites.current, place.category),
          iconColor,
          dimmed: place.status === 'rejected' || place.status === 'visited',
          label,
        }),
        title: label,
        alt: label,
        keyboard: true,
        riseOnHover: true,
      })
      marker.on('click', () => openPlace.current(id))
      markers.current.set(id, { marker, signature })
      added.push(marker)
    }
    if (added.length) cluster.addLayers(added)

    // Fit to the pins on first load and whenever the filters change — not on every realtime update,
    // and not when we're about to zoom to one pin for "Show on map".
    const fitKey = JSON.stringify(filters)
    if (fittedFor.current !== fitKey && wanted.size > 0 && !focusRef.current) {
      fittedFor.current = fitKey
      map.fitBounds(L.latLngBounds(pinned.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 })
    }
  }, [pinned, colorBy, board.memberById, filters])

  // "Show on map" from a place sheet: zoom to that pin, then open its sheet.
  useEffect(() => {
    if (!focusId) return
    const marker = markers.current.get(focusId)?.marker
    const map = mapRef.current
    if (!marker || !map) return
    // Clustering is off from FOCUS_ZOOM, so the pin is visible without markercluster's zoomToShowLayer
    // (whose async callback can outlive the marker and throw).
    map.setView(marker.getLatLng(), FOCUS_ZOOM)
    fittedFor.current = JSON.stringify(filters)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('focus')
        next.set('place', focusId)
        return next
      },
      { replace: true },
    )
  }, [focusId, pinned, filters, setParams])

  function fitAll() {
    const map = mapRef.current
    if (!map || pinned.length === 0) return
    map.fitBounds(L.latLngBounds(pinned.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 })
  }

  const filterCount = (statuses.join() === DEFAULT_STATUSES.join() ? 0 : 1) + categories.length + members.length
  const legend =
    colorBy === 'member'
      ? board.members.map((m) => ({ key: m.id, label: m.display_name, color: memberColor(m) }))
      : CATEGORIES.filter((c) => pinned.some((p) => p.category === c.key)).map((c) => ({ key: c.key, label: c.label, color: c.color }))

  return (
    <>
      <PageHeader
        title="Map"
        subtitle="Every place, pinned by who added it."
        actions={
          ready && (
            <Button variant="secondary" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-controls="map-filters">
              <SlidersHorizontal className="size-4" aria-hidden />
              Filters{filterCount ? ` (${filterCount})` : ''}
            </Button>
          )
        }
      />
      <CategoryIconSprites ref={sprites} />

      {board.isPending ? (
        <SkeletonCard lines={8} />
      ) : board.isError ? (
        <Card>
          <ErrorState message="Couldn't load the places." onRetry={() => void board.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtersOpen && (
            <Card id="map-filters" className="grid gap-3 animate-rise">
              <div>
                <h2 className="mb-1.5 text-sm font-extrabold">Status</h2>
                <StatusChips value={statuses} onChange={setStatuses} />
              </div>
              <div>
                <h2 className="mb-1.5 text-sm font-extrabold">Added by</h2>
                <MemberChips members={board.members} value={members} onChange={setMembers} />
              </div>
              <div>
                <h2 className="mb-1.5 text-sm font-extrabold">Category</h2>
                <CategoryChips value={categories} onChange={setCategories} />
              </div>
              {hasActiveFilters(filters) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 justify-self-start"
                  onClick={() => {
                    setStatuses(DEFAULT_STATUSES)
                    setCategories([])
                    setMembers([])
                  }}
                >
                  Reset filters
                </Button>
              )}
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Color pins by" className="inline-flex rounded-full bg-surface-2 p-1">
              {(['member', 'category'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={colorBy === key}
                  onClick={() => setColorBy(key)}
                  className={clsx(
                    'min-h-11 rounded-full px-4 text-sm font-bold transition',
                    colorBy === key ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
                  )}
                >
                  {key === 'member' ? 'Color by member' : 'Color by category'}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={fitAll} disabled={pinned.length === 0}>
              <Expand className="size-4" aria-hidden />
              Fit all pins
            </Button>
            <span className="ml-auto text-sm text-muted" aria-live="polite">
              {pinned.length} {pinned.length === 1 ? 'pin' : 'pins'}
            </span>
          </div>

          <div className="relative">
            <div
              ref={mapEl}
              className="tabi-map h-[62dvh] min-h-80 w-full overflow-hidden rounded-card border border-border shadow-card lg:h-[calc(100dvh-17rem)]"
              role="region"
              aria-label="Map of places. Pins are buttons; press Enter on one to open its details."
            />
            {pinned.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center p-6">
                <div className="pointer-events-auto max-w-sm rounded-card bg-surface/95 shadow-card">
                  <EmptyState
                    title={board.places?.length ? 'No pins match' : 'No pins yet'}
                    message={
                      board.places?.length
                        ? 'Try different filters, or set pins for the places listed below.'
                        : 'Places with an address appear here, colored by family member and category.'
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {legend.length > 0 && (
            <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {legend.map((item) => (
                <li key={item.key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-3 rounded-full border border-border" style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
              {colorBy === 'member' && <li className="text-muted">· icon shows the category · faded = rejected or visited</li>}
            </ul>
          )}

          {unpinned.length > 0 && (
            <Card className="animate-rise">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <MapPinOff className="size-4 text-muted" aria-hidden />
                Not on the map yet ({unpinned.length})
              </h2>
              <ul className="flex flex-wrap gap-2">
                {unpinned.map((p) => (
                  <li key={p.id}>
                    <Button variant="secondary" size="sm" className="min-h-11" onClick={() => sheet.openPlace(p.id)}>
                      {p.name}
                      <span className="text-xs font-normal text-muted">
                        {p.geocode_status === 'pending' ? 'finding…' : 'needs a pin'}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
