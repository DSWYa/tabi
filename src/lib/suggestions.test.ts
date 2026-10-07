import type { ItineraryItem } from './itinerary'
import type { Place } from './places'
import { describeSuggestion, previewApproval, splitSuggestions, suggestablePlaces, type Suggestion } from './suggestions'

const entry = (id: string, day: string, slot: ItineraryItem['slot'], sort_order: number, start_time: string | null, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, day, slot, sort_order, start_time, place_id: null, title: id, end_time: null, notes: null,
  reservation_status: 'none', reservation_ref: null, reservation_time: null, created_by: null, created_at: '', updated_at: '', ...extra,
})

const suggestion = (id: string, extra: Partial<Suggestion> = {}): Suggestion => ({
  id, place_id: null, item_id: null, title: null, day: '2026-11-24', slot: 'evening', start_time: null, note: null,
  status: 'pending', suggested_by: 'casey', reviewed_by: null, reviewed_at: null, review_note: null,
  created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...extra,
})

const items = [
  entry('dinner', '2026-11-24', 'evening', 0, '18:30:00'),
  entry('bar', '2026-11-24', 'evening', 1, '21:00:00'),
  entry('senso', '2026-11-23', 'morning', 0, '08:30:00', { title: null, place_id: 'p-senso', end_time: '10:00:00' }),
]
const names: Record<string, string> = { 'p-sky': 'Shibuya Sky', 'p-senso': 'Senso-ji' }
const placeName = (id: string) => names[id]

describe('splitSuggestions', () => {
  it('lists pending oldest-first and reviewed newest-first', () => {
    const list = [
      suggestion('new', { created_at: '2026-10-03T00:00:00Z' }),
      suggestion('old', { created_at: '2026-10-01T00:00:00Z' }),
      suggestion('ok', { status: 'approved', reviewed_at: '2026-10-02T00:00:00Z' }),
      suggestion('no', { status: 'rejected', reviewed_at: '2026-10-04T00:00:00Z' }),
    ]
    const { pending, reviewed } = splitSuggestions(list)
    expect(pending.map((s) => s.id)).toEqual(['old', 'new'])
    expect(reviewed.map((s) => s.id)).toEqual(['no', 'ok'])
  })
})

describe('describeSuggestion', () => {
  it('describes a new stop for a place, with the time', () => {
    expect(describeSuggestion(suggestion('s', { place_id: 'p-sky', start_time: '17:00:00' }), items, placeName)).toEqual({
      kind: 'new', what: 'Shibuya Sky', when: 'Tue, Nov 24 · Evening, 17:00', from: null,
    })
  })
  it('describes a free-form stop', () => {
    expect(describeSuggestion(suggestion('s', { title: 'Ramen crawl', slot: 'afternoon' }), items, placeName)).toMatchObject({
      kind: 'new', what: 'Ramen crawl', when: 'Tue, Nov 24 · Afternoon',
    })
  })
  it('describes a move, naming the entry and where it is now', () => {
    expect(describeSuggestion(suggestion('s', { item_id: 'senso', day: '2026-11-25', slot: 'morning', start_time: '08:00:00' }), items, placeName)).toEqual({
      kind: 'move', what: 'Senso-ji', when: 'Wed, Nov 25 · Morning, 08:00', from: 'Mon, Nov 23 · 08:30',
    })
  })
  it('copes with a move whose entry was deleted', () => {
    expect(describeSuggestion(suggestion('s', { item_id: 'gone' }), items, placeName)).toMatchObject({ kind: 'move', from: null })
  })
})

describe('previewApproval (mirrors review_itinerary_suggestion)', () => {
  it('adds a new stop by time inside its slot', () => {
    const after = previewApproval(items, suggestion('s', { place_id: 'p-sky', start_time: '19:00:00' }), 'new-id', 'morgan')
    const evening = after.filter((i) => i.day === '2026-11-24' && i.slot === 'evening').map((i) => i.id)
    expect(evening).toEqual(['dinner', 'new-id', 'bar'])
    expect(after.find((i) => i.id === 'new-id')).toMatchObject({ place_id: 'p-sky', created_by: 'morgan', reservation_status: 'none', sort_order: 0.5 })
  })
  it('adds an untimed stop at the end of its slot', () => {
    const after = previewApproval(items, suggestion('s', { title: 'Karaoke' }), 'new-id', 'morgan')
    expect(after.filter((i) => i.slot === 'evening').map((i) => i.id)).toEqual(['dinner', 'bar', 'new-id'])
  })
  it('moves an existing entry and drops its end time when the start changes', () => {
    const after = previewApproval(items, suggestion('s', { item_id: 'senso', day: '2026-11-24', slot: 'evening', start_time: '20:00:00' }), 'unused', 'morgan')
    expect(after).toHaveLength(items.length)
    expect(after.filter((i) => i.slot === 'evening').map((i) => i.id)).toEqual(['dinner', 'senso', 'bar'])
    expect(after.find((i) => i.id === 'senso')).toMatchObject({ day: '2026-11-24', start_time: '20:00:00', end_time: null })
  })
  it('keeps the end time and the spot when only the day stays the same and the time is unchanged', () => {
    const after = previewApproval(items, suggestion('s', { item_id: 'senso', day: '2026-11-23', slot: 'morning', start_time: '08:30:00' }), 'x', null)
    expect(after.find((i) => i.id === 'senso')).toMatchObject({ sort_order: 0, end_time: '10:00:00' })
  })
  it('leaves the itinerary alone if the entry to move is gone', () => {
    expect(previewApproval(items, suggestion('s', { item_id: 'gone' }), 'x', null)).toBe(items)
  })
})

it('only offers places still in play, planned ones first', () => {
  const place = (id: string, name: string, status: Place['status']) => ({ id, name, status }) as Place
  const list = suggestablePlaces([place('1', 'Zoo', 'in_plan'), place('2', 'Arcade', 'awaiting'), place('3', 'Disney', 'rejected'), place('4', 'Aquarium', 'in_plan'), place('5', 'Done', 'visited')])
  expect(list.map((p) => p.name)).toEqual(['Aquarium', 'Zoo', 'Arcade'])
})
