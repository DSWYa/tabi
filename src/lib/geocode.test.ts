import {
  createRateLimiter, geocodeCandidates, geocodePlace, GeocodeUnavailableError, normalizeGeocodeQuery, simplifyAddress,
  type GeocodeCache, type GeocodeResult,
} from './geocode'

function fakeCache(initial: Record<string, GeocodeResult> = {}) {
  const rows = new Map(Object.entries(initial))
  const cache: GeocodeCache & { rows: typeof rows } = {
    rows,
    getMany: vi.fn(async (queries: string[]) => new Map(queries.filter((q) => rows.has(q)).map((q) => [q, rows.get(q)!]))),
    put: vi.fn(async (query: string, result: GeocodeResult) => void rows.set(query, result)),
  }
  return cache
}

const SENSOJI = { found: true, lat: 35.7148, lng: 139.7967, displayName: 'Sensō-ji' }

describe('query normalization', () => {
  it('normalizes width, case and spacing (matches the DB check)', () => {
    expect(normalizeGeocodeQuery('  Senso-ji,   TOKYO ')).toBe('senso-ji, tokyo')
    expect(normalizeGeocodeQuery('ＴＯＫＹＯ　Tower')).toBe('tokyo tower')
    expect(normalizeGeocodeQuery(', Shibuya ,')).toBe('shibuya')
    const result = normalizeGeocodeQuery(`a${' b'.repeat(400)}`)
    expect(result.length).toBeLessThanOrEqual(300)
    expect(result).toBe(result.trim())
  })

  it('simplifies Tokyo street addresses into neighbourhoods', () => {
    expect(simplifyAddress('6-1-16 Toyosu, Koto City, Tokyo')).toBe('Toyosu, Koto, Tokyo')
    expect(simplifyAddress('1 Chome Jingumae, Shibuya City, Tokyo')).toBe('Jingumae, Shibuya, Tokyo')
    expect(simplifyAddress('Sunshine City Alpa 2F, 3-1-2 Higashiikebukuro, Toshima-ku, Tokyo')).toBe(
      'Sunshine Alpa, Higashiikebukuro, Toshima, Tokyo',
    )
  })

  it('builds candidates from precise to loose, without duplicates', () => {
    expect(geocodeCandidates({ name: 'Senso-ji', address: '2-3-1 Asakusa, Taito City, Tokyo' }, 'Tokyo, Japan')).toEqual([
      '2-3-1 asakusa, taito city, tokyo',
      'senso-ji, asakusa, taito, tokyo',
      'senso-ji, tokyo',
      'asakusa, taito, tokyo',
    ])
    expect(geocodeCandidates({ name: 'Ghibli Museum', address: null }, 'Tokyo, Japan')).toEqual(['ghibli museum, tokyo'])
    expect(geocodeCandidates({ name: '  ', address: '' })).toEqual([])
  })
})

describe('geocodePlace (shared cache + Nominatim)', () => {
  const place = { name: 'Senso-ji', address: '2-3-1 Asakusa, Taito City, Tokyo' }

  it('uses cached answers and skips the network entirely', async () => {
    const cache = fakeCache({ '2-3-1 asakusa, taito city, tokyo': { found: false }, 'senso-ji, asakusa, taito, tokyo': SENSOJI })
    const search = vi.fn()
    const outcome = await geocodePlace(place, { cache, search })
    expect(outcome).toMatchObject({ found: true, lat: 35.7148, query: 'senso-ji, asakusa, taito, tokyo', networkLookups: 0 })
    expect(search).not.toHaveBeenCalled()
    expect(cache.getMany).toHaveBeenCalledTimes(1) // one round trip for all candidates
  })

  it('asks Nominatim on a miss and caches every definitive answer, hits and misses', async () => {
    const cache = fakeCache()
    const search = vi.fn(async (q: string) => (q === 'senso-ji, asakusa, taito, tokyo' ? SENSOJI : { found: false }))
    const outcome = await geocodePlace(place, { cache, search })
    expect(outcome).toMatchObject({ found: true, networkLookups: 2 })
    expect([...cache.rows.keys()]).toEqual(['2-3-1 asakusa, taito city, tokyo', 'senso-ji, asakusa, taito, tokyo'])
    expect(cache.rows.get('2-3-1 asakusa, taito city, tokyo')).toEqual({ found: false })

    // Second member, same place: answered from the cache.
    search.mockClear()
    await geocodePlace(place, { cache, search })
    expect(search).not.toHaveBeenCalled()
  })

  it('reports a final "not found" only after every candidate answered', async () => {
    const cache = fakeCache()
    const outcome = await geocodePlace(place, { cache, search: async () => ({ found: false }) })
    expect(outcome).toMatchObject({ found: false, networkLookups: 4 })
    expect(cache.rows.size).toBe(4)
  })

  it('never caches outages and throws so the place stays pending', async () => {
    const cache = fakeCache()
    const search = vi.fn(async (q: string) => {
      if (q.startsWith('senso-ji')) throw new GeocodeUnavailableError()
      return { found: false }
    })
    await expect(geocodePlace(place, { cache, search })).rejects.toBeInstanceOf(GeocodeUnavailableError)
    expect([...cache.rows.keys()]).toEqual(['2-3-1 asakusa, taito city, tokyo', 'asakusa, taito, tokyo'])
  })

  it('still finds a hit after an outage on an earlier candidate', async () => {
    const search = vi.fn(async (q: string) => {
      if (q.startsWith('2-3-1')) throw new GeocodeUnavailableError()
      return SENSOJI
    })
    await expect(geocodePlace(place, { cache: fakeCache(), search })).resolves.toMatchObject({ found: true })
  })

  it('survives an unreachable or read-only cache', async () => {
    const cache: GeocodeCache = {
      getMany: async () => { throw new Error('offline') },
      put: async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }) },
    }
    await expect(geocodePlace(place, { cache, search: async () => SENSOJI })).resolves.toMatchObject({ found: true, networkLookups: 1 })
  })
})

describe('rate limiter', () => {
  it('starts calls at least the interval apart, in order', async () => {
    let now = 0
    const starts: number[] = []
    const clock = { now: () => now, sleep: async (ms: number) => void (now += ms) }
    const schedule = createRateLimiter(1100, clock)
    const results = await Promise.all(
      [1, 2, 3].map((n) => schedule(async () => { starts.push(now); now += 50; return n })),
    )
    expect(results).toEqual([1, 2, 3])
    expect(starts).toEqual([0, 1100, 2200])
  })

  it('keeps going after a failed call', async () => {
    let now = 0
    const schedule = createRateLimiter(1000, { now: () => now, sleep: async (ms) => void (now += ms) })
    await expect(schedule(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(schedule(async () => 'next')).resolves.toBe('next')
  })
})
