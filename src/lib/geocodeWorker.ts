import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { geocodePlace, GeocodeUnavailableError, searchNominatim, type GeocodeCache, type GeocodeResult } from './geocode'
import { useMe } from './members'
import { canEditPlace, placesKey, usePlaces, type Place } from './places'
import { supabase } from './supabase'
import { useTrip } from './trip'

/** The shared Postgres cache (members can read and add rows; nobody can rewrite them). */
export const supabaseGeocodeCache: GeocodeCache = {
  async getMany(queries) {
    const { data, error } = await supabase.from('geocode_cache').select('query, found, lat, lng, display_name').in('query', queries)
    if (error) throw error
    return new Map(
      data.map((row): [string, GeocodeResult] => [
        row.query,
        { found: row.found, lat: row.lat ?? undefined, lng: row.lng ?? undefined, displayName: row.display_name ?? undefined },
      ]),
    )
  },
  async put(query, result) {
    const { error } = await supabase.from('geocode_cache').upsert(
      { query, found: result.found, lat: result.lat ?? null, lng: result.lng ?? null, display_name: result.displayName ?? null },
      { onConflict: 'query', ignoreDuplicates: true },
    )
    if (error) throw error
  },
}

/** Look up one place and store the result on it (only if it's still waiting for a lookup). */
export async function geocodeAndSave(place: Pick<Place, 'id' | 'name' | 'address'>, destination: string | null): Promise<void> {
  const outcome = await geocodePlace(place, { cache: supabaseGeocodeCache, search: (q) => searchNominatim(q), destination })
  const patch = outcome.found
    ? { geocode_status: 'found' as const, lat: outcome.lat!, lng: outcome.lng!, geocoded_address: place.address }
    : { geocode_status: 'not_found' as const, lat: null, lng: null, geocoded_address: place.address }
  // Conditional: never overwrite a pin someone placed by hand while we were looking.
  const { error } = await supabase.from('places').update(patch).eq('id', place.id).eq('geocode_status', 'pending')
  if (error) throw error
}

/**
 * Background geocoding: pins every "pending" place this member is allowed to edit (their own, or all for
 * admins), one at a time. Mounted once per signed-in member. Failures leave the place pending for next time.
 */
export function useGeocodePendingPlaces() {
  const { me } = useMe()
  const { data: places } = usePlaces()
  const { data: trip } = useTrip()
  const queryClient = useQueryClient()
  const attempted = useRef(new Set<string>())
  const running = useRef(false)
  const destination = trip?.destination ?? null

  useEffect(() => {
    if (!me || !places || running.current || !navigator.onLine) return
    // Keyed by updated_at so an edited place (new address → pending again) gets a fresh attempt.
    const attemptKey = (p: Place) => `${p.id}@${p.updated_at}`
    const queue = places.filter((p) => p.geocode_status === 'pending' && canEditPlace(p, me) && !attempted.current.has(attemptKey(p)))
    if (queue.length === 0) return

    running.current = true
    void (async () => {
      try {
        for (const place of queue) {
          attempted.current.add(attemptKey(place))
          try {
            await geocodeAndSave(place, destination)
          } catch (error) {
            // Service down / offline: stop for this session; the place stays pending and is retried on next load.
            if (error instanceof GeocodeUnavailableError) break
          }
        }
      } finally {
        running.current = false
        void queryClient.invalidateQueries({ queryKey: placesKey })
      }
    })()
  }, [me, places, destination, queryClient])
}
