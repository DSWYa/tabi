import { placeAt, renumber, stepIndex } from './reorder'
import { applySectionMove, sectionInput, sortSections, validateSection, type TravelSection } from './travelInfo'

const section = (id: string, sort_order: number, created_at = '2026-10-01'): TravelSection => ({
  id, sort_order, created_at, title: id, icon: null, body: '', updated_at: created_at, updated_by: null,
})

describe('reorder helpers (mirror the move_* RPCs)', () => {
  it('places an id at an index among the others, clamped', () => {
    expect(placeAt(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(placeAt(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(placeAt(['a', 'b', 'c'], 'a', 10)).toEqual(['b', 'c', 'a'])
    expect(placeAt(['a', 'b'], 'new', -5)).toEqual(['new', 'a', 'b'])
  })
  it('renumbers 0..n and steps up/down with edges', () => {
    expect([...renumber(['x', 'y'])]).toEqual([['x', 0], ['y', 1]])
    expect(stepIndex(['a', 'b', 'c'], 'b', -1)).toBe(0)
    expect(stepIndex(['a', 'b', 'c'], 'b', 1)).toBe(2)
    expect(stepIndex(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(stepIndex(['a', 'b', 'c'], 'c', 1)).toBeNull()
    expect(stepIndex(['a'], 'zz', 1)).toBeNull()
  })
})

describe('Travel Info sections', () => {
  it('sorts by order, then creation time', () => {
    expect(sortSections([section('b', 1), section('late', 0, '2026-10-02'), section('early', 0, '2026-10-01')]).map((s) => s.id))
      .toEqual(['early', 'late', 'b'])
  })
  it('moves a section and renumbers everything', () => {
    const moved = applySectionMove([section('flights', 0), section('hotel', 1), section('sos', 2)], 'sos', 0)
    expect(moved.map((s) => [s.id, s.sort_order])).toEqual([['sos', 0], ['flights', 1], ['hotel', 2]])
  })
  it('validates title and icon, and trims what is saved', () => {
    expect(validateSection({ title: ' ', icon: '', body: '' }).title).toBeTruthy()
    expect(validateSection({ title: 'x'.repeat(81), icon: '', body: '' }).title).toBeTruthy()
    expect(validateSection({ title: 'Flights', icon: 'rocket' as never, body: '' }).icon).toBeTruthy()
    expect(validateSection({ title: 'Flights', icon: 'plane', body: 'x' })).toEqual({})
    expect(sectionInput({ title: ' Flights ', icon: '', body: 'Line 1\n\n  ' })).toEqual({ title: 'Flights', icon: null, body: 'Line 1' })
  })
})
