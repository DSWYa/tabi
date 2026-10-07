import {
  addDays, applyMove, dayNumber, editPatch, formatItemWhen, groupKey, itemsByPlace, nextItem, nextReservation, parseGroupKey,
  slotItems, sortItinerary, sortOrderFor, stepTarget, tripDays, tripNowKey, type ItemInput, type ItineraryItem,
} from './itinerary'

type Item = Parameters<typeof sortItinerary>[0][number] & {
  id: string
  place_id: string | null
  reservation_status: 'required' | 'booked' | 'none'
}
const item = (id: string, day: string, slot: Item['slot'], start_time: string | null, extra: Partial<Item> = {}): Item => ({
  id, day, slot, start_time, sort_order: 0, place_id: null, reservation_status: 'none', ...extra,
})

const items = sortItinerary([
  item('dinner', '2026-11-22', 'evening', null, { reservation_status: 'required' }),
  item('shrine', '2026-11-22', 'morning', '09:00:00', { place_id: 'meiji' }),
  item('lunch', '2026-11-22', 'afternoon', '12:30:00'),
  item('teamlab', '2026-11-24', 'afternoon', '15:00:00', { place_id: 'teamlab', reservation_status: 'booked' }),
  item('teamlab-again', '2026-11-25', 'morning', null, { place_id: 'teamlab' }),
])

it('orders by day, then morning → afternoon → evening', () => {
  expect(items.map((i) => i.id)).toEqual(['shrine', 'lunch', 'dinner', 'teamlab', 'teamlab-again'])
})

it('finds what is next on the trip clock', () => {
  expect(nextItem(items, '2026-11-20 10:00')?.id).toBe('shrine')
  expect(nextItem(items, '2026-11-22 10:00')?.id).toBe('lunch')
  expect(nextItem(items, '2026-11-30 00:00')).toBeNull()
  expect(nextReservation(items, '2026-11-22 10:00')?.id).toBe('dinner')
  expect(nextReservation(items, '2026-11-22 19:00')?.id).toBe('teamlab')
})

it('reads "now" in Tokyo regardless of the device time zone', () => {
  // 2026-11-21 23:30 UTC is 2026-11-22 08:30 in Tokyo.
  expect(tripNowKey(new Date(Date.UTC(2026, 10, 21, 23, 30)), 'Asia/Tokyo')).toBe('2026-11-22 08:30')
})

it('derives "scheduled" places from itinerary entries', () => {
  const map = itemsByPlace(items)
  expect(map.get('teamlab')?.map((i) => i.id)).toEqual(['teamlab', 'teamlab-again'])
  expect(map.has('lunch')).toBe(false)
})

it('formats when an item happens', () => {
  expect(formatItemWhen(item('x', '2026-11-22', 'morning', '09:00:00'))).toBe('Sun, Nov 22 · 09:00')
  expect(formatItemWhen(item('x', '2026-11-22', 'evening', null))).toBe('Sun, Nov 22 · Evening')
})

// ---- Phase 4: ordering, moves and the move up/down fallback --------------------------

const full = (id: string, day: string, slot: ItineraryItem['slot'], sort_order: number, start_time: string | null = null): ItineraryItem => ({
  id, day, slot, sort_order, start_time, place_id: null, title: id, end_time: null, notes: null,
  reservation_status: 'none', reservation_ref: null, reservation_time: null, created_by: null, created_at: '', updated_at: '',
})

const trip = [
  full('a', '2026-11-22', 'morning', 0, '09:00:00'),
  full('b', '2026-11-22', 'morning', 1, '11:00:00'),
  full('c', '2026-11-22', 'morning', 2),
  full('d', '2026-11-22', 'afternoon', 0, '14:00:00'),
  full('e', '2026-11-24', 'evening', 0),
]
const days = tripDays('2026-11-22', '2026-11-24', trip)
const ids = (list: ItineraryItem[], day: string, slot: ItineraryItem['slot']) => slotItems(list, day, slot).map((i) => i.id)

describe('ordering inside a slot', () => {
  it('follows the admin order, not the clock', () => {
    const reordered = [full('late', '2026-11-22', 'morning', 0, '11:00:00'), full('early', '2026-11-22', 'morning', 1, '08:00:00')]
    expect(ids(reordered, '2026-11-22', 'morning')).toEqual(['late', 'early'])
  })
  it('breaks ties by time, then id', () => {
    const tied = [full('y', '2026-11-22', 'morning', 0), full('x', '2026-11-22', 'morning', 0), full('t', '2026-11-22', 'morning', 0, '08:00:00')]
    expect(ids(tied, '2026-11-22', 'morning')).toEqual(['t', 'x', 'y'])
  })
})

describe('applyMove (mirrors move_itinerary_item)', () => {
  it('moves within a slot and renumbers it 0..n', () => {
    const moved = applyMove(trip, 'c', { day: '2026-11-22', slot: 'morning', index: 0 })
    expect(ids(moved, '2026-11-22', 'morning')).toEqual(['c', 'a', 'b'])
    expect(slotItems(moved, '2026-11-22', 'morning').map((i) => i.sort_order)).toEqual([0, 1, 2])
  })
  it('moves into another day and slot', () => {
    const moved = applyMove(trip, 'a', { day: '2026-11-24', slot: 'evening', index: 1 })
    expect(ids(moved, '2026-11-24', 'evening')).toEqual(['e', 'a'])
    expect(ids(moved, '2026-11-22', 'morning')).toEqual(['b', 'c'])
    expect(moved.find((i) => i.id === 'a')).toMatchObject({ day: '2026-11-24', slot: 'evening', sort_order: 1 })
  })
  it('clamps the index and ignores unknown ids', () => {
    expect(ids(applyMove(trip, 'a', { day: '2026-11-22', slot: 'morning', index: 99 }), '2026-11-22', 'morning')).toEqual(['b', 'c', 'a'])
    expect(ids(applyMove(trip, 'a', { day: '2026-11-22', slot: 'morning', index: -3 }), '2026-11-22', 'morning')).toEqual(['a', 'b', 'c'])
    expect(applyMove(trip, 'nope', { day: '2026-11-22', slot: 'morning', index: 0 })).toBe(trip)
  })
  it('drops into an empty slot', () => {
    const moved = applyMove(trip, 'd', { day: '2026-11-23', slot: 'morning', index: 0 })
    expect(ids(moved, '2026-11-23', 'morning')).toEqual(['d'])
    expect(ids(moved, '2026-11-22', 'afternoon')).toEqual([])
  })
})

describe('stepTarget (move up / move down buttons)', () => {
  it('steps within a slot', () => {
    expect(stepTarget(trip, days, 'b', -1)).toEqual({ day: '2026-11-22', slot: 'morning', index: 0 })
    expect(stepTarget(trip, days, 'a', 1)).toEqual({ day: '2026-11-22', slot: 'morning', index: 1 })
  })
  it('crosses into the next slot at the bottom edge, landing first', () => {
    expect(stepTarget(trip, days, 'c', 1)).toEqual({ day: '2026-11-22', slot: 'afternoon', index: 0 })
  })
  it('crosses into the previous slot at the top edge, landing last', () => {
    expect(stepTarget(trip, days, 'd', -1)).toEqual({ day: '2026-11-22', slot: 'morning', index: 3 })
  })
  it('crosses days, including empty ones', () => {
    expect(stepTarget(trip, days, 'd', 1)).toEqual({ day: '2026-11-22', slot: 'evening', index: 0 })
    const evening = applyMove(trip, 'd', { day: '2026-11-22', slot: 'evening', index: 0 })
    expect(stepTarget(evening, days, 'd', 1)).toEqual({ day: '2026-11-23', slot: 'morning', index: 0 })
    expect(stepTarget(trip, days, 'e', -1)).toEqual({ day: '2026-11-24', slot: 'afternoon', index: 0 })
  })
  it('stops at the very first and last spot', () => {
    expect(stepTarget(trip, days, 'a', -1)).toBeNull()
    expect(stepTarget(trip, days, 'e', 1)).toBeNull()
  })
  it('a step then the opposite step is a round trip', () => {
    const down = applyMove(trip, 'c', stepTarget(trip, days, 'c', 1)!)
    const back = applyMove(down, 'c', stepTarget(down, days, 'c', -1)!)
    expect(ids(back, '2026-11-22', 'morning')).toEqual(['a', 'b', 'c'])
  })
})

describe('sortOrderFor (mirrors itinerary_sort_order_for)', () => {
  it('goes last without a time, or into an empty slot at 0', () => {
    expect(sortOrderFor(trip, '2026-11-22', 'morning', null)).toBe(3)
    expect(sortOrderFor(trip, '2026-11-23', 'morning', '10:00')).toBe(0)
  })
  it('goes before the first entry that starts later', () => {
    expect(sortOrderFor(trip, '2026-11-22', 'morning', '10:00')).toBe(0.5)
    expect(sortOrderFor(trip, '2026-11-22', 'morning', '08:00')).toBe(-1)
    expect(sortOrderFor(trip, '2026-11-22', 'morning', '12:00')).toBe(3)
  })
  it('can ignore the entry being edited', () => {
    expect(sortOrderFor(trip, '2026-11-22', 'morning', '12:00', 'c')).toBe(2)
  })
})

describe('editPatch', () => {
  const input = (patch: Partial<ItemInput> = {}): ItemInput => ({
    place_id: null, title: 'a', day: '2026-11-22', slot: 'morning', start_time: '09:00', end_time: null, notes: null,
    reservation_status: 'none', reservation_ref: null, reservation_time: null, ...patch,
  })
  it('keeps the spot when only details change', () => {
    expect(editPatch(trip, trip[0], input({ notes: 'Bring coins' }))).not.toHaveProperty('sort_order')
  })
  it('re-places the entry by time when the time or slot changes', () => {
    expect(editPatch(trip, trip[0], input({ start_time: '12:00' })).sort_order).toBe(3)
    expect(editPatch(trip, trip[0], input({ slot: 'afternoon', start_time: '13:00' })).sort_order).toBe(-1)
  })
})

describe('trip days', () => {
  it('lists every trip day plus days with entries outside the dates', () => {
    expect(tripDays('2026-11-29', '2026-12-01', [{ day: '2026-11-20' }])).toEqual(['2026-11-20', '2026-11-29', '2026-11-30', '2026-12-01'])
    expect(tripDays(null, null, [{ day: '2026-11-22' }, { day: '2026-11-22' }])).toEqual(['2026-11-22'])
  })
  it('adds days across month ends and numbers trip days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(dayNumber('2026-11-22', '2026-11-20', '2026-11-29')).toBe(3)
    expect(dayNumber('2026-11-19', '2026-11-20', '2026-11-29')).toBeNull()
    expect(dayNumber('2026-11-30', '2026-11-20', '2026-11-29')).toBeNull()
  })
  it('round-trips group keys (drop-zone ids)', () => {
    expect(parseGroupKey(groupKey('2026-11-22', 'evening'))).toEqual({ day: '2026-11-22', slot: 'evening' })
    expect(parseGroupKey('2026-11-22|brunch')).toBeNull()
    expect(parseGroupKey('item-id')).toBeNull()
  })
})
