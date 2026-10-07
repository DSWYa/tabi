// Domain constants shared by UI and (mirrored by) database CHECK constraints.
// If you change a key here, update supabase/migrations as well.

export const CATEGORIES = [
  { key: 'food', label: 'Food', color: '#E4572E' },
  { key: 'cafe', label: 'Café / Dessert', color: '#EC8FB5' },
  { key: 'shopping', label: 'Shopping', color: '#F0B429' },
  { key: 'anime', label: 'Anime / Gaming', color: '#8B5CF6' },
  { key: 'attraction', label: 'Attraction', color: '#2563EB' },
  { key: 'museum', label: 'Museum', color: '#0EA5A4' },
  { key: 'shrine', label: 'Shrine / Temple', color: '#B91C1C' },
  { key: 'park', label: 'Park / Nature', color: '#22A55A' },
  { key: 'entertainment', label: 'Entertainment', color: '#DB2777' },
  { key: 'nightlife', label: 'Nightlife', color: '#4338CA' },
  { key: 'relaxation', label: 'Relaxation / Spa', color: '#06B6D4' },
  { key: 'other', label: 'Other', color: '#78716C' },
] as const
export type CategoryKey = (typeof CATEGORIES)[number]['key']

export const PLACE_STATUSES = [
  { key: 'awaiting', label: 'Awaiting Decision', tone: 'warn' },
  { key: 'in_plan', label: 'In Plan', tone: 'ok' },
  { key: 'rejected', label: 'Rejected', tone: 'bad' },
  { key: 'visited', label: 'Visited', tone: 'info' },
] as const
export type PlaceStatus = (typeof PLACE_STATUSES)[number]['key']

export const RESERVATION_STATUSES = [
  { key: 'required', label: 'Reservation Required', tone: 'warn' },
  { key: 'booked', label: 'Booked', tone: 'ok' },
  { key: 'none', label: 'No Reservation', tone: 'neutral' },
] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]['key']

export const VOTES = [
  { key: 'yes', label: 'Yes' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no', label: 'No' },
] as const
export type VoteValue = (typeof VOTES)[number]['key']

/** How a place got (or failed to get) its map pin. */
export const GEOCODE_STATUSES = [
  { key: 'pending', label: 'Finding on the map…' },
  { key: 'found', label: 'Pinned from the address' },
  { key: 'not_found', label: "Couldn't find it on the map" },
  { key: 'manual', label: 'Pin placed by hand' },
] as const
export type GeocodeStatus = (typeof GEOCODE_STATUSES)[number]['key']

export const PRIORITY_LABELS = ['', 'Someday', 'Nice to have', 'Want to go', 'Really want to go', 'Must do'] as const

export const DAY_SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
] as const
export type DaySlot = (typeof DAY_SLOTS)[number]['key']

export const SUGGESTION_STATUSES = [
  { key: 'pending', label: 'Waiting for the admin', tone: 'warn' },
  { key: 'approved', label: 'Approved', tone: 'ok' },
  { key: 'rejected', label: 'Not this time', tone: 'bad' },
] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]['key']

/** Icons a Travel Info section can use (CHECK constraint in the Phase 4 migration). */
export const TRAVEL_ICONS = [
  { key: 'plane', label: 'Flights' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'train', label: 'Transport' },
  { key: 'map', label: 'Map' },
  { key: 'receipt', label: 'Receipts / tax-free' },
  { key: 'wallet', label: 'Money' },
  { key: 'shopping-bag', label: 'Shopping' },
  { key: 'utensils', label: 'Food' },
  { key: 'phone', label: 'Phone' },
  { key: 'wifi', label: 'Internet' },
  { key: 'luggage', label: 'Packing' },
  { key: 'calendar', label: 'Dates' },
  { key: 'heart-pulse', label: 'Health' },
  { key: 'siren', label: 'Emergency' },
  { key: 'info', label: 'Info' },
  { key: 'sparkles', label: 'Tips' },
] as const
export type TravelIconKey = (typeof TRAVEL_ICONS)[number]['key']

/** Member map-pin colors. Each can belong to one member (UNIQUE in the DB). */
export const PIN_COLORS = [
  { key: 'sakura', label: 'Sakura', hex: '#F48FB1' },
  { key: 'coral', label: 'Coral', hex: '#FF6F61' },
  { key: 'tangerine', label: 'Tangerine', hex: '#FF9F1C' },
  { key: 'sunflower', label: 'Sunflower', hex: '#F4C430' },
  { key: 'matcha', label: 'Matcha', hex: '#7CB342' },
  { key: 'teal', label: 'Teal', hex: '#26A69A' },
  { key: 'sky', label: 'Sky', hex: '#42A5F5' },
  { key: 'indigo', label: 'Indigo', hex: '#5C6BC0' },
  { key: 'violet', label: 'Violet', hex: '#9C6ADE' },
  { key: 'plum', label: 'Plum', hex: '#8E3B66' },
] as const
export type PinColorKey = (typeof PIN_COLORS)[number]['key']

export const NOTIFICATION_KINDS = [
  { key: 'place_added', label: 'New place added', default: true },
  { key: 'vote_cast', label: 'Someone voted', default: false },
  { key: 'status_changed', label: 'Place status changed', default: true },
  { key: 'itinerary_changed', label: 'Itinerary changed', default: true },
  { key: 'suggestion_submitted', label: 'Itinerary suggestion submitted', default: true },
  { key: 'suggestion_reviewed', label: 'Suggestion approved / rejected', default: true },
  { key: 'reservation_upcoming', label: 'Upcoming reservation', default: true },
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['key']

export const LIMITS = {
  /** Largest photo we accept before resizing; the stored 256px WebP is tiny (bucket cap is 2 MB). */
  avatarSourceBytes: 10 * 1024 * 1024,
  whiteboardImageBytes: 5 * 1024 * 1024,
  /** Mirrors the CHECK constraints on public.places. */
  placeName: 120,
  placeAddress: 300,
  placeWebsite: 500,
  placeNotes: 4000,
  placePriceJpy: 10_000_000,
  /** Itinerary, suggestions and Travel Info (CHECK constraints in the init migration). */
  itemTitle: 120,
  itemNotes: 4000,
  reservationRef: 120,
  suggestionNote: 2000,
  reviewNote: 2000,
  travelTitle: 80,
  travelBody: 20_000,
} as const

const byKey = <T extends { key: string }>(list: readonly T[]) =>
  Object.fromEntries(list.map((item) => [item.key, item])) as Record<T['key'], T>

export const categoryByKey = byKey(CATEGORIES)
export const placeStatusByKey = byKey(PLACE_STATUSES)
export const reservationByKey = byKey(RESERVATION_STATUSES)
export const pinColorByKey = byKey(PIN_COLORS)
export const voteByKey = byKey(VOTES)
export const geocodeStatusByKey = byKey(GEOCODE_STATUSES)
export const suggestionStatusByKey = byKey(SUGGESTION_STATUSES)
export const travelIconByKey = byKey(TRAVEL_ICONS)
