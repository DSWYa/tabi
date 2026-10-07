import { Crosshair, Loader2, MapPin, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { FormMessage, inputClass } from '@/components/ui/Field'
import { categoryByKey } from '@/lib/constants'
import { parseCoordinates, TOKYO_CENTER } from '@/lib/maps'
import { placeErrorMessage, useUpdatePlace, type Place } from '@/lib/places'
import { CategoryIconSprites } from './CategoryIconSprites'
import { addBaseLayer, iconMarkup, L, pinIcon } from './leaflet'

type LatLng = { lat: number; lng: number }

/**
 * Manual pin correction (lazy chunk). Drag the pin, tap the map, pan and use "Pin at map centre"
 * (keyboard friendly), or paste coordinates / a Google Maps link.
 */
export default function PinPicker({ place, onDone, onCancel }: { place: Place; onDone: () => void; onCancel: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null)
  const sprites = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const initial: LatLng | null = place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null
  const [position, setPosition] = useState<LatLng | null>(initial)
  const [paste, setPaste] = useState('')
  const [error, setError] = useState('')
  const update = useUpdatePlace()

  useEffect(() => {
    const el = mapEl.current
    if (!el) return
    const start = initial ?? TOKYO_CENTER
    const map = L.map(el, { zoomControl: true }).setView([start.lat, start.lng], initial ? 17 : 12)
    addBaseLayer(map)
    const { color } = categoryByKey[place.category]
    const marker = L.marker([start.lat, start.lng], {
      draggable: true,
      autoPan: true,
      keyboard: false,
      icon: pinIcon({ fill: color, icon: iconMarkup(sprites.current, place.category), iconColor: color, label: place.name }),
      opacity: initial ? 1 : 0.6,
    }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      marker.setOpacity(1)
      setPosition({ lat: p.lat, lng: p.lng })
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng).setOpacity(1)
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    mapRef.current = map
    markerRef.current = marker
    // The sheet animates open; measure again once it has its final size.
    const timer = setTimeout(() => map.invalidateSize(), 320)
    return () => {
      clearTimeout(timer)
      map.remove()
      mapRef.current = null
    }
    // Build the map once per opened place; later prop changes (realtime refetch) must not reset the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id])

  function moveTo(next: LatLng, zoom?: number) {
    markerRef.current?.setLatLng([next.lat, next.lng]).setOpacity(1)
    mapRef.current?.setView([next.lat, next.lng], zoom ?? Math.max(mapRef.current.getZoom(), 16))
    setPosition(next)
  }

  function applyPaste(e: FormEvent) {
    e.preventDefault()
    const parsed = parseCoordinates(paste)
    if (!parsed) {
      setError('Couldn’t find coordinates there. Paste something like 35.6585, 139.7022 or a Google Maps link.')
      return
    }
    setError('')
    moveTo(parsed, 17)
  }

  async function save(patch: Parameters<typeof update.mutateAsync>[0]['patch']) {
    setError('')
    try {
      await update.mutateAsync({ id: place.id, patch })
      onDone()
    } catch (e) {
      setError(placeErrorMessage(e as Error))
    }
  }

  return (
    <div className="grid gap-3">
      <CategoryIconSprites ref={sprites} />
      <p className="text-sm text-muted">Drag the pin or tap the map where {place.name} really is.</p>
      <div
        ref={mapEl}
        className="tabi-map h-72 w-full overflow-hidden rounded-2xl border border-border sm:h-96"
        role="application"
        aria-label={`Map for placing the pin for ${place.name}. Use arrow keys to pan, then “Pin at map centre”.`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={() => {
            const c = mapRef.current?.getCenter()
            if (c) moveTo({ lat: c.lat, lng: c.lng }, mapRef.current!.getZoom())
          }}
        >
          <Crosshair className="size-4" aria-hidden />
          Pin at map centre
        </Button>
        <span className="text-xs text-muted" aria-live="polite">
          {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'No pin yet'}
        </span>
      </div>

      <form onSubmit={applyPaste} className="flex gap-2">
        <label className="sr-only" htmlFor="pin-paste">Coordinates or Google Maps link</label>
        <input
          id="pin-paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste coordinates or a Google Maps link"
          autoComplete="off"
          className={inputClass}
        />
        <Button type="submit" variant="secondary" className="shrink-0">Use</Button>
      </form>

      <FormMessage tone="error">{error}</FormMessage>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {place.geocode_status !== 'pending' && (
          <Button
            variant="ghost"
            className="mr-auto"
            disabled={update.isPending}
            onClick={() => void save({ geocode_status: 'pending', lat: null, lng: null, geocoded_address: null })}
          >
            <RotateCcw className="size-4" aria-hidden />
            Look up address again
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!position || update.isPending}
          onClick={() =>
            position && void save({ lat: position.lat, lng: position.lng, geocode_status: 'manual', geocoded_address: place.address })
          }
        >
          {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
          Save pin
        </Button>
      </div>
    </div>
  )
}
