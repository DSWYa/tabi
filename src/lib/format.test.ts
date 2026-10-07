import { daysBetween, formatDateRange, formatPrice, initials, parseDateOnly, tripCountdown } from './format'

describe('formatPrice', () => {
  it('shows yen and approximate dollars', () => {
    expect(formatPrice(4200, 0.0067)).toBe('¥4,200 / ~$28')
  })
  it('omits USD when no rate is cached yet', () => {
    expect(formatPrice(4200, null)).toBe('¥4,200')
  })
  it('handles free and unknown prices', () => {
    expect(formatPrice(0, 0.0067)).toBe('Free')
    expect(formatPrice(null)).toBe('—')
  })
})

describe('dates', () => {
  it('parses date-only columns as local dates', () => {
    const d = parseDateOnly('2026-11-22')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 22])
  })
  it('counts calendar days regardless of time of day', () => {
    expect(daysBetween(new Date(2026, 10, 20, 23, 59), new Date(2026, 10, 22, 0, 1))).toBe(2)
    expect(daysBetween(new Date(2026, 10, 22), new Date(2026, 10, 20))).toBe(-2)
  })
  it('formats ranges compactly', () => {
    expect(formatDateRange('2026-11-20', '2026-11-29')).toBe('Nov 20–29, 2026')
    expect(formatDateRange('2026-11-28', '2026-12-03')).toBe('Nov 28 – Dec 3, 2026')
  })
})

it('builds initials', () => {
  expect(initials('Drake Westbrook')).toBe('DW')
  expect(initials('  sam ')).toBe('S')
})

describe('tripCountdown', () => {
  const today = new Date(2026, 10, 10) // Nov 10, 2026
  it('handles unset dates', () => {
    expect(tripCountdown(null, null, today)).toEqual({ kind: 'unset' })
  })
  it('counts down before the trip', () => {
    expect(tripCountdown('2026-11-20', '2026-11-29', today)).toEqual({ kind: 'before', days: 10 })
  })
  it('counts days during the trip', () => {
    expect(tripCountdown('2026-11-10', '2026-11-19', today)).toEqual({ kind: 'during', day: 1, of: 10 })
    expect(tripCountdown('2026-11-05', null, today)).toEqual({ kind: 'during', day: 6, of: null })
  })
  it('knows when it is over', () => {
    expect(tripCountdown('2026-11-01', '2026-11-09', today)).toEqual({ kind: 'after' })
  })
})
