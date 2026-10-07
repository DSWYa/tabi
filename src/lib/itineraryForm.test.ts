import type { ItineraryItem } from './itinerary'
import {
  emptyItemForm, emptySuggestionForm, formToItemInput, formToSuggestionInput, itemToForm, moveSuggestionForm, validateItemForm,
  validateSuggestionForm,
} from './itineraryForm'

const valid = { ...emptyItemForm({ day: '2026-11-22', slot: 'afternoon' }), title: 'Lunch' }

describe('itinerary entry form', () => {
  it('needs a place or a title, and a day', () => {
    expect(validateItemForm(emptyItemForm())).toMatchObject({ title: expect.any(String), day: expect.any(String) })
    expect(validateItemForm({ ...emptyItemForm({ day: '2026-11-22', placeId: 'p1' }) })).toEqual({})
    expect(validateItemForm(valid)).toEqual({})
  })
  it('checks lengths and times', () => {
    expect(validateItemForm({ ...valid, title: 'x'.repeat(121) }).title).toBeTruthy()
    expect(validateItemForm({ ...valid, start: '25:00' }).start).toBeTruthy()
    expect(validateItemForm({ ...valid, end: '10:00' }).end).toMatch(/start time/)
    expect(validateItemForm({ ...valid, reservation: 'booked', reservationTime: '7pm' }).reservationTime).toBeTruthy()
  })
  it('clears booking details when there is no reservation (the DB requires it)', () => {
    const input = formToItemInput({ ...valid, reservation: 'none', reservationRef: 'ABC', reservationTime: '19:00' })
    expect(input).toMatchObject({ reservation_status: 'none', reservation_ref: null, reservation_time: null })
    expect(formToItemInput({ ...valid, reservation: 'booked', reservationRef: ' ABC-1 ', reservationTime: '19:00' }))
      .toMatchObject({ reservation_ref: 'ABC-1', reservation_time: '19:00' })
  })
  it('turns blanks into nulls and drops an end time without a start', () => {
    expect(formToItemInput({ ...valid, title: '  ', placeId: 'p1', end: '12:00', notes: ' ' }))
      .toMatchObject({ title: null, place_id: 'p1', start_time: null, end_time: null, notes: null })
  })
  it('round-trips a stored entry', () => {
    const row = {
      id: 'i', place_id: 'p', title: null, day: '2026-11-22', slot: 'evening', start_time: '18:30:00', end_time: '20:00:00', notes: 'n',
      reservation_status: 'booked', reservation_ref: 'R', reservation_time: '18:30:00', sort_order: 0, created_by: null, created_at: '', updated_at: '',
    } satisfies ItineraryItem
    expect(itemToForm(row)).toMatchObject({ start: '18:30', end: '20:00', reservationTime: '18:30', placeId: 'p', title: '' })
    expect(formToItemInput(itemToForm(row))).toMatchObject({ start_time: '18:30', end_time: '20:00', reservation_ref: 'R' })
  })
})

describe('suggestion form', () => {
  const current = {
    id: 'senso', place_id: 'p', title: null, day: '2026-11-23', slot: 'morning', start_time: '08:30:00', end_time: null, notes: null,
    reservation_status: 'none', reservation_ref: null, reservation_time: null, sort_order: 0, created_by: null, created_at: '', updated_at: '',
  } satisfies ItineraryItem

  it('a new stop needs a place or a description', () => {
    expect(validateSuggestionForm(emptySuggestionForm({ day: '2026-11-24' })).title).toBeTruthy()
    expect(validateSuggestionForm(emptySuggestionForm({ day: '2026-11-24', placeId: 'p' }))).toEqual({})
  })
  it('a move has to actually change something', () => {
    expect(validateSuggestionForm(moveSuggestionForm(current), current).day).toMatch(/different/)
    expect(validateSuggestionForm({ ...moveSuggestionForm(current), start: '09:00' }, current)).toEqual({})
  })
  it('a move only carries the entry and its new time (DB: one kind per suggestion)', () => {
    const input = formToSuggestionInput({ ...moveSuggestionForm(current), placeId: 'ignored', title: 'ignored', day: '2026-11-25', note: '  Quieter  ' })
    expect(input).toEqual({ place_id: null, title: null, item_id: 'senso', day: '2026-11-25', slot: 'morning', start_time: '08:30', note: 'Quieter' })
  })
  it('a new stop never carries an item id', () => {
    expect(formToSuggestionInput(emptySuggestionForm({ day: '2026-11-24', title: 'Ramen', itemId: 'stale' }))).toMatchObject({ item_id: null, title: 'Ramen', start_time: null })
  })
})
