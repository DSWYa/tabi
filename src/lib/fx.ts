import { useQuery } from '@tanstack/react-query'

// JPY → USD from Frankfurter (ECB reference rates, free, no key). Rates change once per working day,
// so each device caches the last rate and only asks again after FX_MAX_AGE_MS. When the network is
// down, a stale rate is still better than none; with no rate at all, prices show yen only.

export const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=JPY&symbols=USD'
export const FX_CACHE_KEY = 'tabi.fx.jpy-usd'
export const FX_MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface CachedRate {
  /** US dollars per yen, e.g. 0.0067. */
  usdPerJpy: number
  /** ECB reference date the rate is for ("YYYY-MM-DD"). */
  date: string
  /** When this device fetched it (ms since epoch). */
  fetchedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function readCachedRate(storage: StorageLike | null = defaultStorage()): CachedRate | null {
  try {
    const raw = storage?.getItem(FX_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedRate>
    if (isValidRate(parsed.usdPerJpy) && typeof parsed.date === 'string' && typeof parsed.fetchedAt === 'number') {
      return { usdPerJpy: parsed.usdPerJpy, date: parsed.date, fetchedAt: parsed.fetchedAt }
    }
  } catch {
    // corrupt or unavailable — treat as no cache
  }
  return null
}

export function writeCachedRate(rate: CachedRate, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(FX_CACHE_KEY, JSON.stringify(rate))
  } catch {
    // storage full or blocked — we just fetch again next time
  }
}

export function isRateFresh(rate: CachedRate | null, now: number): rate is CachedRate {
  return Boolean(rate && now - rate.fetchedAt < FX_MAX_AGE_MS && rate.fetchedAt <= now)
}

export async function fetchUsdPerJpy(fetchFn: typeof fetch = fetch): Promise<{ usdPerJpy: number; date: string }> {
  const res = await fetchFn(FX_URL)
  if (!res.ok) throw new Error(`Exchange rate service answered ${res.status}`)
  const body = (await res.json()) as { date?: unknown; rates?: { USD?: unknown } }
  const usdPerJpy = body.rates?.USD
  if (!isValidRate(usdPerJpy) || typeof body.date !== 'string') throw new Error('Unexpected exchange rate response')
  return { usdPerJpy, date: body.date }
}

/** Fresh cached rate, else a newly fetched one, else the stale cached one, else null. Never throws. */
export async function getUsdPerJpy(deps: {
  fetchFn?: typeof fetch
  storage?: StorageLike | null
  now?: () => number
} = {}): Promise<CachedRate | null> {
  const { fetchFn = fetch, storage = defaultStorage(), now = Date.now } = deps
  const cached = readCachedRate(storage)
  if (isRateFresh(cached, now())) return cached
  try {
    const fetched = { ...(await fetchUsdPerJpy(fetchFn)), fetchedAt: now() }
    writeCachedRate(fetched, storage)
    return fetched
  } catch {
    return cached
  }
}

/** Yen → dollars, rounded to cents. */
export function jpyToUsd(jpy: number, usdPerJpy: number): number {
  return Math.round(jpy * usdPerJpy * 100) / 100
}

/** Dollars → yen, rounded to whole yen. */
export function usdToJpy(usd: number, usdPerJpy: number): number {
  return Math.round(usd / usdPerJpy)
}

/** A typed amount ("1,000", "¥ 2500", "$12.50") as a number; null when empty or not a sensible amount. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[\s,¥$￥]/g, '')
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value <= 1e10 ? value : null
}

/** The cached JPY→USD rate with its date, or null until one is known. */
export function useFxRate(): CachedRate | null {
  const { data } = useQuery({
    queryKey: ['fx', 'JPY', 'USD'],
    queryFn: () => getUsdPerJpy(),
    initialData: () => readCachedRate() ?? undefined,
    initialDataUpdatedAt: () => readCachedRate()?.fetchedAt,
    staleTime: FX_MAX_AGE_MS,
    retry: false,
  })
  return data ?? null
}

/** The cached JPY→USD rate (US dollars per yen), or null until one is known. */
export function useUsdPerJpy(): number | null {
  return useFxRate()?.usdPerJpy ?? null
}
