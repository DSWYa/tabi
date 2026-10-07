const yen = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export function formatYen(amount: number): string {
  return yen.format(amount)
}

/** "~$28", or "~$3.17" under $10 where cents still matter. */
export function formatUsd(amount: number): string {
  return `~${amount < 10 ? usdCents.format(amount) : usd.format(amount)}`
}

/** "¥4,200 / ~$28". USD part is omitted when no rate is known yet. */
export function formatPrice(jpy: number | null | undefined, usdPerJpy?: number | null): string {
  if (jpy == null) return '—'
  if (jpy === 0) return 'Free'
  const base = yen.format(jpy)
  return usdPerJpy ? `${base} / ${formatUsd(Math.round(jpy * usdPerJpy * 100) / 100)}` : base
}

/** Whole calendar days from `from` to `to` (local dates), negative if in the past. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86_400_000)
}

/** Parse a "YYYY-MM-DD" date column as a local date (not UTC midnight). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateRange(start: string, end: string): string {
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return sameMonth
    ? `${month(s)} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
    : `${month(s)} ${s.getDate()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export type Countdown =
  | { kind: 'unset' }
  | { kind: 'before'; days: number }
  | { kind: 'during'; day: number; of: number | null }
  | { kind: 'after' }

/** Where `today` sits relative to the trip dates ("YYYY-MM-DD" columns, either may be null). */
export function tripCountdown(start: string | null, end: string | null, today: Date): Countdown {
  if (!start) return { kind: 'unset' }
  const untilStart = daysBetween(today, parseDateOnly(start))
  if (untilStart > 0) return { kind: 'before', days: untilStart }
  const length = end ? daysBetween(parseDateOnly(start), parseDateOnly(end)) + 1 : null
  const day = 1 - untilStart
  if (length != null && day > length) return { kind: 'after' }
  return { kind: 'during', day, of: length }
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date ("Nov 24"). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = daysBetween(then, now)
  if (days <= 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
