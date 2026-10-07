// Address → map pin, via OpenStreetMap's Nominatim, with a family-wide cache in Postgres (geocode_cache).
// Nominatim's usage policy: at most 1 request per second, cache results, show attribution (the map does).
// English-style Tokyo addresses ("6-1-16 Toyosu, Koto City, Tokyo") often don't match as written, so we try
// a few progressively looser queries and keep the first hit. Every definitive answer (hit *or* miss) is
// cached per query; network errors are never cached, so the place stays "pending" and is retried later.

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
export const NOMINATIM_MIN_INTERVAL_MS = 1100
const MAX_QUERY_LENGTH = 300

export interface GeocodeResult {
  found: boolean
  lat?: number
  lng?: number
  displayName?: string
}

export interface GeocodeOutcome extends GeocodeResult {
  /** The query that produced the hit (or the last one tried). */
  query: string | null
  /** How many queries went to Nominatim (the rest came from the cache). */
  networkLookups: number
}

/** Thrown when Nominatim couldn't be reached/answered; the outcome is unknown, so nothing is cached. */
export class GeocodeUnavailableError extends Error {
  constructor(message = 'The map search service is unavailable right now.') {
    super(message)
    this.name = 'GeocodeUnavailableError'
  }
}

/** Cache key: NFKC (full-width → ASCII), lowercase, single spaces, trimmed. Mirrors the DB check. */
export function normalizeGeocodeQuery(query: string): string {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .slice(0, MAX_QUERY_LENGTH)
    .trim()
}

const NOISE_WORDS = /^(city|ward|chome|chōme|bldg\.?|building|floor|fl\.?|〒)$/i

/**
 * Drop the parts Nominatim chokes on: block/house numbers ("6-1-16", "1 Chome", "2F"), postal codes,
 * and "City"/"Ward" suffixes. "6-1-16 Toyosu, Koto City, Tokyo" → "Toyosu, Koto, Tokyo".
 */
export function simplifyAddress(address: string): string {
  return address
    .normalize('NFKC')
    .split(/[,、]/)
    .map((segment) =>
      segment
        .split(/\s+/)
        .filter((word) => word && !/\d/.test(word) && !NOISE_WORDS.test(word))
        .join(' ')
        .replace(/-(ku|shi)$/i, ''),
    )
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ')
}

/** "Tokyo, Japan" → "Tokyo": the city used to anchor name-only searches. */
export function destinationCity(destination: string | null | undefined): string {
  return (destination ?? '').split(',')[0]?.trim() || 'Tokyo'
}

/** Queries to try in order (normalized, de-duplicated). */
export function geocodeCandidates(place: { name: string; address: string | null }, destination?: string | null): string[] {
  const name = place.name.trim()
  const address = place.address?.trim() ?? ''
  const city = destinationCity(destination)
  const raw: string[] = []
  if (address) {
    const simple = simplifyAddress(address)
    raw.push(address)
    if (simple && name) raw.push(`${name}, ${simple}`)
    if (name) raw.push(`${name}, ${city}`)
    // Neighbourhood-level fallback; a lone city name would just pin the city centre, so skip that.
    if (simple.includes(',')) raw.push(simple)
  } else if (name) {
    raw.push(`${name}, ${city}`)
  }
  return [...new Set(raw.map(normalizeGeocodeQuery).filter(Boolean))]
}

/** Serializes calls so consecutive ones start at least `intervalMs` apart (shared by all callers). */
export function createRateLimiter(
  intervalMs: number,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  let queue: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity
  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastStart + intervalMs - clock.now()
      if (wait > 0) await clock.sleep(wait)
      lastStart = clock.now()
      return task()
    })
    queue = run.catch(() => undefined)
    return run
  }
}

const nominatimLimiter = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS)

/** One Nominatim lookup (rate-limited). Throws GeocodeUnavailableError on network/server errors. */
export async function searchNominatim(query: string, fetchFn: typeof fetch = fetch): Promise<GeocodeResult> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'jp', 'accept-language': 'en' })
  return nominatimLimiter(async () => {
    let res: Response
    try {
      res = await fetchFn(`${NOMINATIM_URL}?${params}`, { headers: { Accept: 'application/json' } })
    } catch {
      throw new GeocodeUnavailableError("Couldn't reach the map search service.")
    }
    if (!res.ok) throw new GeocodeUnavailableError(`Map search answered ${res.status}.`)
    const body = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
    const hit = Array.isArray(body) ? body[0] : undefined
    const lat = Number(hit?.lat)
    const lng = Number(hit?.lon)
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return { found: false }
    return { found: true, lat, lng, displayName: hit.display_name?.slice(0, 500) }
  })
}

export interface GeocodeCache {
  /** Cached answers for any of these (normalized) queries. */
  getMany: (queries: string[]) => Promise<Map<string, GeocodeResult>>
  /** Best effort: a failed write must not fail the lookup. */
  put: (query: string, result: GeocodeResult) => Promise<void>
}

/** Try each candidate: cache first, then Nominatim. Stops at the first hit. */
export async function geocodePlace(
  place: { name: string; address: string | null },
  deps: { cache: GeocodeCache; search: (query: string) => Promise<GeocodeResult>; destination?: string | null },
): Promise<GeocodeOutcome> {
  const candidates = geocodeCandidates(place, deps.destination)
  if (candidates.length === 0) return { found: false, query: null, networkLookups: 0 }

  let cached = new Map<string, GeocodeResult>()
  try {
    cached = await deps.cache.getMany(candidates)
  } catch {
    // cache unreachable: still try the network
  }

  let networkLookups = 0
  let unavailable: GeocodeUnavailableError | null = null
  for (const query of candidates) {
    let result = cached.get(query)
    if (!result) {
      try {
        networkLookups++
        result = await deps.search(query)
      } catch (error) {
        if (!(error instanceof GeocodeUnavailableError)) throw error
        unavailable = error
        continue
      }
      try {
        await deps.cache.put(query, result)
      } catch {
        // someone else cached it first, or we're offline — fine either way
      }
    }
    if (result.found) return { ...result, query, networkLookups }
  }
  // A miss is only final if every candidate got a real answer.
  if (unavailable) throw unavailable
  return { found: false, query: candidates[candidates.length - 1], networkLookups }
}
