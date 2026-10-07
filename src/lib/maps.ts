// Small, pure helpers for links and coordinates. Google Maps is used for directions only (no API key).

export const TOKYO_CENTER = { lat: 35.6812, lng: 139.7671 } as const

type Locatable = { name: string; address: string | null; lat: number | null; lng: number | null }

/** Google Maps directions from wherever the phone is, by public transport. Opens the app on phones. */
export function directionsUrl(place: Locatable): string {
  const destination =
    place.lat != null && place.lng != null
      ? `${place.lat.toFixed(6)},${place.lng.toFixed(6)}`
      : [place.name, place.address].filter(Boolean).join(', ')
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'transit' })
  return `https://www.google.com/maps/dir/?${params}`
}

/** Only http(s) links are ever rendered as <a href> (the DB enforces this too). */
export function safeWebsite(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/** Adds https:// when someone types "example.com". Returns '' for blank input. */
export function normalizeWebsiteInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/**
 * Coordinates from "35.6585, 139.7022" or a pasted Google Maps link
 * (".../@35.6585,139.7022,17z", "?q=35.6585,139.7022", "!3d35.6585!4d139.7022"). Null if none found.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const input = text.trim()
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // exact place pin in a Google Maps link
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // map viewport centre
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/, // plain "lat, lng"
  ]
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match) {
      const lat = Number(match[1])
      const lng = Number(match[2])
      if (isValidLatLng(lat, lng)) return { lat, lng }
    }
  }
  return null
}
