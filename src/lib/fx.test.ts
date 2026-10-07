import { formatPrice, formatUsd } from './format'
import { FX_CACHE_KEY, FX_MAX_AGE_MS, getUsdPerJpy, isRateFresh, jpyToUsd, readCachedRate, writeCachedRate } from './fx'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
const NOW = Date.UTC(2026, 9, 6, 12)

describe('price conversion', () => {
  it('converts yen to dollars, rounded to cents', () => {
    expect(jpyToUsd(2500, 0.00633)).toBe(15.83)
    expect(jpyToUsd(0, 0.00633)).toBe(0)
    expect(jpyToUsd(1, 0.00633)).toBe(0.01)
  })
  it('shows cents only while they matter', () => {
    expect(formatUsd(3.17)).toBe('~$3.17')
    expect(formatUsd(15.83)).toBe('~$16')
    expect(formatPrice(500, 0.00633)).toBe('¥500 / ~$3.17')
    expect(formatPrice(9400, 0.00633)).toBe('¥9,400 / ~$60')
  })
})

describe('exchange-rate cache', () => {
  it('round-trips through storage and rejects junk', () => {
    const storage = memoryStorage()
    writeCachedRate({ usdPerJpy: 0.0067, date: '2026-10-05', fetchedAt: NOW }, storage)
    expect(readCachedRate(storage)).toEqual({ usdPerJpy: 0.0067, date: '2026-10-05', fetchedAt: NOW })

    expect(readCachedRate(memoryStorage({ [FX_CACHE_KEY]: '{not json' }))).toBeNull()
    expect(readCachedRate(memoryStorage({ [FX_CACHE_KEY]: '{"usdPerJpy":-1,"date":"x","fetchedAt":1}' }))).toBeNull()
    expect(readCachedRate(null)).toBeNull()
  })

  it('knows when a cached rate is fresh', () => {
    const rate = { usdPerJpy: 0.0067, date: '2026-10-05', fetchedAt: NOW }
    expect(isRateFresh(rate, NOW + FX_MAX_AGE_MS - 1)).toBe(true)
    expect(isRateFresh(rate, NOW + FX_MAX_AGE_MS)).toBe(false)
    expect(isRateFresh(rate, NOW - 1000)).toBe(false) // clock went backwards: refetch
    expect(isRateFresh(null, NOW)).toBe(false)
  })

  it('uses a fresh cached rate without touching the network', async () => {
    const storage = memoryStorage()
    writeCachedRate({ usdPerJpy: 0.0067, date: '2026-10-05', fetchedAt: NOW - 1000 }, storage)
    const fetchFn = ok({})
    const rate = await getUsdPerJpy({ fetchFn, storage, now: () => NOW })
    expect(rate?.usdPerJpy).toBe(0.0067)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refreshes a stale rate and caches the new one', async () => {
    const storage = memoryStorage()
    writeCachedRate({ usdPerJpy: 0.0067, date: '2026-10-01', fetchedAt: NOW - FX_MAX_AGE_MS - 1 }, storage)
    const fetchFn = ok({ amount: 1, base: 'JPY', date: '2026-10-06', rates: { USD: 0.00633 } })
    const rate = await getUsdPerJpy({ fetchFn, storage, now: () => NOW })
    expect(rate).toEqual({ usdPerJpy: 0.00633, date: '2026-10-06', fetchedAt: NOW })
    expect(readCachedRate(storage)?.usdPerJpy).toBe(0.00633)
  })

  it('falls back to the stale rate when offline, and to null with nothing cached', async () => {
    const failing = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const storage = memoryStorage()
    writeCachedRate({ usdPerJpy: 0.0067, date: '2026-10-01', fetchedAt: NOW - FX_MAX_AGE_MS * 3 }, storage)
    expect((await getUsdPerJpy({ fetchFn: failing, storage, now: () => NOW }))?.usdPerJpy).toBe(0.0067)
    expect(await getUsdPerJpy({ fetchFn: failing, storage: memoryStorage(), now: () => NOW })).toBeNull()
  })

  it('ignores malformed responses', async () => {
    const storage = memoryStorage()
    expect(await getUsdPerJpy({ fetchFn: ok({ rates: { USD: 'lots' } }), storage, now: () => NOW })).toBeNull()
    expect(storage.data.size).toBe(0)
    const serverError = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    expect(await getUsdPerJpy({ fetchFn: serverError, storage, now: () => NOW })).toBeNull()
  })
})
