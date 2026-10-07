import { DAY_SLOTS, LIMITS, RESERVATION_STATUSES, type DaySlot, type ReservationStatus } from './constants'
import type { ItemInput, ItineraryItem } from './itinerary'

// Pure helpers for the itinerary entry form and the suggestion form (validation mirrors the DB constraints).

export interface ItemFormValues {
  /** '' = a free-form entry (then a title is required). */
  placeId: string
  title: string
  day: string
  slot: DaySlot
  start: string
  end: string
  notes: string
  reservation: ReservationStatus
  reservationRef: string
  reservationTime: string
}

export type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

export function emptyItemForm(defaults: Partial<Pick<ItemFormValues, 'placeId' | 'day' | 'slot'>> = {}): ItemFormValues {
  return {
    placeId: defaults.placeId ?? '', title: '', day: defaults.day ?? '', slot: defaults.slot ?? 'morning',
    start: '', end: '', notes: '', reservation: 'none', reservationRef: '', reservationTime: '',
  }
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export function itemToForm(item: ItineraryItem): ItemFormValues {
  return {
    placeId: item.place_id ?? '',
    title: item.title ?? '',
    day: item.day,
    slot: item.slot,
    start: hhmm(item.start_time),
    end: hhmm(item.end_time),
    notes: item.notes ?? '',
    reservation: item.reservation_status,
    reservationRef: item.reservation_ref ?? '',
    reservationTime: hhmm(item.reservation_time),
  }
}

function checkTime(value: string): string | undefined {
  return value && !TIME_RE.test(value) ? 'Use a time like 14:30.' : undefined
}

export function validateItemForm(values: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {}
  const title = values.title.trim()
  if (!values.placeId && !title) errors.title = 'Pick a place or give this stop a name.'
  else if (title.length > LIMITS.itemTitle) errors.title = `Keep it under ${LIMITS.itemTitle} characters.`
  if (!DAY_RE.test(values.day)) errors.day = 'Pick a day.'
  if (!DAY_SLOTS.some((s) => s.key === values.slot)) errors.slot = 'Pick morning, afternoon or evening.'
  errors.start = checkTime(values.start)
  errors.end = checkTime(values.end)
  if (!errors.end && values.end && !values.start) errors.end = 'Add a start time too (or clear the end time).'
  if (values.notes.length > LIMITS.itemNotes) errors.notes = `Notes can be up to ${LIMITS.itemNotes} characters.`
  if (!RESERVATION_STATUSES.some((r) => r.key === values.reservation)) errors.reservation = 'Pick a reservation option.'
  if (values.reservation !== 'none') {
    if (values.reservationRef.trim().length > LIMITS.reservationRef) {
      errors.reservationRef = `Keep the reference under ${LIMITS.reservationRef} characters.`
    }
    errors.reservationTime = checkTime(values.reservationTime)
  }
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as ItemFormErrors
}

const blankToNull = (s: string) => (s.trim() ? s.trim() : null)

/** Form strings → the row shape (call only when validateItemForm returned no errors). */
export function formToItemInput(values: ItemFormValues): ItemInput {
  const reserved = values.reservation !== 'none'
  return {
    place_id: values.placeId || null,
    title: blankToNull(values.title),
    day: values.day,
    slot: values.slot,
    start_time: values.start || null,
    end_time: values.start ? values.end || null : null,
    notes: blankToNull(values.notes),
    reservation_status: values.reservation,
    // The DB rejects a reference/time without a reservation, so "No reservation" clears them.
    reservation_ref: reserved ? blankToNull(values.reservationRef) : null,
    reservation_time: reserved ? values.reservationTime || null : null,
  }
}

// ---- suggestions -----------------------------------------------------------------

export interface SuggestionFormValues {
  /** 'new' proposes a stop; 'move' proposes a new day/time for an existing entry. */
  kind: 'new' | 'move'
  placeId: string
  title: string
  itemId: string
  day: string
  slot: DaySlot
  start: string
  note: string
}

export type SuggestionFormErrors = Partial<Record<keyof SuggestionFormValues, string>>

export interface SuggestionInput {
  place_id: string | null
  item_id: string | null
  title: string | null
  day: string
  slot: DaySlot
  start_time: string | null
  note: string | null
}

export function emptySuggestionForm(defaults: Partial<SuggestionFormValues> = {}): SuggestionFormValues {
  return { kind: 'new', placeId: '', title: '', itemId: '', day: '', slot: 'morning', start: '', note: '', ...defaults }
}

/** A "change this entry" suggestion starts from where the entry is now. */
export function moveSuggestionForm(item: ItineraryItem): SuggestionFormValues {
  return emptySuggestionForm({ kind: 'move', itemId: item.id, day: item.day, slot: item.slot, start: hhmm(item.start_time) })
}

export function validateSuggestionForm(values: SuggestionFormValues, current?: ItineraryItem): SuggestionFormErrors {
  const errors: SuggestionFormErrors = {}
  if (values.kind === 'new') {
    const title = values.title.trim()
    if (!values.placeId && !title) errors.title = 'Pick a place or describe what you have in mind.'
    else if (title.length > LIMITS.itemTitle) errors.title = `Keep it under ${LIMITS.itemTitle} characters.`
  } else if (!values.itemId) {
    errors.itemId = 'Pick the entry you want to change.'
  } else if (current && current.day === values.day && current.slot === values.slot && hhmm(current.start_time) === values.start) {
    errors.day = 'Choose a different day, part of the day or time.'
  }
  if (!DAY_RE.test(values.day)) errors.day = 'Pick a day.'
  if (!DAY_SLOTS.some((s) => s.key === values.slot)) errors.slot = 'Pick morning, afternoon or evening.'
  const start = checkTime(values.start)
  if (start) errors.start = start
  if (values.note.length > LIMITS.suggestionNote) errors.note = `Keep the note under ${LIMITS.suggestionNote} characters.`
  return errors
}

export function formToSuggestionInput(values: SuggestionFormValues): SuggestionInput {
  const isNew = values.kind === 'new'
  return {
    place_id: isNew ? values.placeId || null : null,
    title: isNew ? blankToNull(values.title) : null,
    item_id: isNew ? null : values.itemId,
    day: values.day,
    slot: values.slot,
    start_time: values.start || null,
    note: blankToNull(values.note),
  }
}
