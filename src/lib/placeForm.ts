import { CATEGORIES, LIMITS, type CategoryKey } from './constants'
import { normalizeWebsiteInput, safeWebsite } from './maps'
import type { Place, PlaceInput } from './places'

/** What the place form edits: all strings, exactly as typed. */
export interface PlaceFormValues {
  name: string
  category: CategoryKey
  priority: number
  price: string
  address: string
  website: string
  notes: string
}

export type PlaceFormErrors = Partial<Record<keyof PlaceFormValues, string>>

export function emptyPlaceForm(): PlaceFormValues {
  return { name: '', category: 'food', priority: 3, price: '', address: '', website: '', notes: '' }
}

export function placeToForm(place: Place): PlaceFormValues {
  return {
    name: place.name,
    category: place.category,
    priority: place.priority,
    price: place.price_jpy == null ? '' : String(place.price_jpy),
    address: place.address ?? '',
    website: place.website ?? '',
    notes: place.notes ?? '',
  }
}

/** "¥2,500", "2500", "２５００" → 2500; "" → null; anything else → NaN. */
export function parseYen(input: string): number | null {
  const cleaned = input.normalize('NFKC').replace(/[¥￥,\s]|yen|円/gi, '')
  if (!cleaned) return null
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN
}

export function validatePlaceForm(values: PlaceFormValues): PlaceFormErrors {
  const errors: PlaceFormErrors = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Give the place a name.'
  else if (name.length > LIMITS.placeName) errors.name = `Keep it under ${LIMITS.placeName} characters.`

  if (!CATEGORIES.some((c) => c.key === values.category)) errors.category = 'Pick a category.'
  if (!Number.isInteger(values.priority) || values.priority < 1 || values.priority > 5) errors.priority = 'Pick a priority from 1 to 5.'

  const price = parseYen(values.price)
  if (price !== null && (Number.isNaN(price) || price > LIMITS.placePriceJpy)) {
    errors.price = 'Enter a whole number of yen, like 2500 (or leave it blank).'
  }

  if (values.address.trim().length > LIMITS.placeAddress) errors.address = `Keep the address under ${LIMITS.placeAddress} characters.`

  const website = normalizeWebsiteInput(values.website)
  if (website && (!safeWebsite(website) || website.length > LIMITS.placeWebsite || /\s/.test(website))) {
    errors.website = 'Enter a web address like https://example.com.'
  }

  if (values.notes.length > LIMITS.placeNotes) errors.notes = `Notes can be up to ${LIMITS.placeNotes} characters.`
  return errors
}

/** Form strings → the row shape (call only when validatePlaceForm returned no errors). */
export function formToInput(values: PlaceFormValues): PlaceInput {
  const blankToNull = (s: string) => (s.trim() ? s.trim() : null)
  return {
    name: values.name.trim(),
    category: values.category,
    priority: values.priority,
    price_jpy: parseYen(values.price),
    address: blankToNull(values.address),
    website: blankToNull(normalizeWebsiteInput(values.website)),
    notes: values.notes.trim() ? values.notes.trim() : null,
  }
}
