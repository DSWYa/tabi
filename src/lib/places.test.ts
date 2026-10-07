import { CATEGORIES } from './constants'
import { emptyPlaceForm, formToInput, parseYen, validatePlaceForm } from './placeForm'
import { filterPlaces, sortPlaces } from './placeFilters'
import { canEditPlace, geocodeResetFor, type Place } from './places'

function place(overrides: Partial<Place>): Place {
  return {
    id: 'id', name: 'Place', category: 'food', priority: 3, price_jpy: null, address: null, website: null, notes: null,
    status: 'awaiting', lat: null, lng: null, geocode_status: 'pending', geocoded_address: null, added_by: 'casey',
    status_changed_by: null, status_changed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('canEditPlace (UX mirror of RLS)', () => {
  it('lets the creator and admins edit', () => {
    expect(canEditPlace({ added_by: 'casey' }, { id: 'casey', role: 'member' })).toBe(true)
    expect(canEditPlace({ added_by: 'casey' }, { id: 'morgan', role: 'admin' })).toBe(true)
    expect(canEditPlace({ added_by: 'casey' }, { id: 'riley', role: 'member' })).toBe(false)
    expect(canEditPlace({ added_by: null }, { id: 'riley', role: 'member' })).toBe(false)
    expect(canEditPlace({ added_by: 'casey' }, null)).toBe(false)
  })
})

describe('geocodeResetFor', () => {
  const found = place({ name: 'Shibuya Sky', address: '2-24-12 Shibuya', geocode_status: 'found' })
  it('re-geocodes when the address changes', () => {
    expect(geocodeResetFor(found, { name: 'Shibuya Sky', address: 'Shibuya Scramble Square' })).toEqual({
      geocode_status: 'pending', lat: null, lng: null, geocoded_address: null,
    })
  })
  it('leaves the pin alone for other edits, or when it was placed by hand', () => {
    expect(geocodeResetFor(found, { name: 'Shibuya Sky!', address: '2-24-12 Shibuya' })).toEqual({})
    expect(geocodeResetFor({ ...found, geocode_status: 'manual' }, { name: 'x', address: 'elsewhere' })).toEqual({})
  })
  it('re-geocodes a renamed place that has no address (the name is the query)', () => {
    expect(geocodeResetFor(place({ name: 'Ghibli', geocode_status: 'not_found' }), { name: 'Ghibli Museum', address: null }))
      .toMatchObject({ geocode_status: 'pending' })
  })
})

describe('place form', () => {
  it('parses yen the way people type it', () => {
    expect(parseYen('¥4,000')).toBe(4000)
    expect(parseYen('２５００')).toBe(2500)
    expect(parseYen('3000円')).toBe(3000)
    expect(parseYen('')).toBeNull()
    expect(parseYen('12.5')).toBeNaN()
    expect(parseYen('-1')).toBeNaN()
  })

  it('validates like the database does', () => {
    expect(validatePlaceForm({ ...emptyPlaceForm(), name: 'Ramen' })).toEqual({})
    const errors = validatePlaceForm({
      ...emptyPlaceForm(), name: '  ', price: 'free', website: 'javascript:alert(1)', notes: 'x'.repeat(4001),
    })
    expect(Object.keys(errors).sort()).toEqual(['name', 'notes', 'price', 'website'])
    expect(validatePlaceForm({ ...emptyPlaceForm(), name: 'x', priority: 6 }).priority).toBeTruthy()
  })

  it('turns form strings into a row', () => {
    expect(formToInput({ ...emptyPlaceForm(), name: ' Tsukiji ', price: '¥4,000', website: 'tsukiji.or.jp', address: ' ', notes: '' }))
      .toEqual({ name: 'Tsukiji', category: 'food', priority: 3, price_jpy: 4000, address: null, website: 'https://tsukiji.or.jp', notes: null })
  })

  it('offers every category the database accepts', () => {
    expect(CATEGORIES).toHaveLength(12)
  })
})

describe('filters and sorting', () => {
  const places = [
    place({ id: 'a', name: 'Café Kitsuné', category: 'cafe', priority: 3, price_jpy: 900, created_at: '2026-10-03', notes: 'matcha latte' }),
    place({ id: 'b', name: 'Senso-ji', category: 'shrine', priority: 5, price_jpy: 0, status: 'in_plan', created_at: '2026-10-01', added_by: 'riley' }),
    place({ id: 'c', name: 'Golden Gai', category: 'nightlife', priority: 2, created_at: '2026-10-02', status: 'rejected' }),
  ]
  const none = { search: '', statuses: [], categories: [], members: [] }

  it('searches name/address/notes, accent- and case-insensitively', () => {
    expect(filterPlaces(places, { ...none, search: 'kitsune' }).map((p) => p.id)).toEqual(['a'])
    expect(filterPlaces(places, { ...none, search: 'MATCHA' }).map((p) => p.id)).toEqual(['a'])
  })
  it('combines status, category and member filters', () => {
    expect(filterPlaces(places, { ...none, statuses: ['in_plan', 'rejected'] }).map((p) => p.id)).toEqual(['b', 'c'])
    expect(filterPlaces(places, { ...none, statuses: ['in_plan', 'rejected'], members: ['casey'] }).map((p) => p.id)).toEqual(['c'])
    expect(filterPlaces(places, { ...none, categories: ['cafe'] }).map((p) => p.id)).toEqual(['a'])
  })
  it('sorts', () => {
    expect(sortPlaces(places, 'newest').map((p) => p.id)).toEqual(['a', 'c', 'b'])
    expect(sortPlaces(places, 'priority').map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(sortPlaces(places, 'price').map((p) => p.id)).toEqual(['b', 'a', 'c']) // unknown price last
    expect(sortPlaces(places, 'name').map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })
})
