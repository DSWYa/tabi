import { directionsUrl, normalizeWebsiteInput, parseCoordinates, safeWebsite } from './maps'

describe('directionsUrl', () => {
  it('routes to exact coordinates by transit when the place is pinned', () => {
    const url = new URL(directionsUrl({ name: 'Senso-ji', address: 'x', lat: 35.7148, lng: 139.7967 }))
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('destination')).toBe('35.714800,139.796700')
    expect(url.searchParams.get('travelmode')).toBe('transit')
  })
  it('falls back to name + address', () => {
    const url = new URL(directionsUrl({ name: 'Café Kitsuné', address: 'Minami-Aoyama, Tokyo', lat: null, lng: null }))
    expect(url.searchParams.get('destination')).toBe('Café Kitsuné, Minami-Aoyama, Tokyo')
  })
})

describe('websites', () => {
  it('only lets http(s) links through', () => {
    expect(safeWebsite('https://www.senso-ji.jp/')).toBe('https://www.senso-ji.jp/')
    expect(safeWebsite('javascript:alert(1)')).toBeNull()
    expect(safeWebsite('data:text/html,hi')).toBeNull()
    expect(safeWebsite('not a url')).toBeNull()
    expect(safeWebsite(null)).toBeNull()
  })
  it('adds https:// to bare domains', () => {
    expect(normalizeWebsiteInput(' tsukiji.or.jp ')).toBe('https://tsukiji.or.jp')
    expect(normalizeWebsiteInput('http://example.com')).toBe('http://example.com')
    expect(normalizeWebsiteInput('javascript:alert(1)')).toBe('javascript:alert(1)') // rejected by validation
    expect(normalizeWebsiteInput('  ')).toBe('')
  })
})

describe('parseCoordinates', () => {
  it.each([
    ['35.6585, 139.7022', { lat: 35.6585, lng: 139.7022 }],
    ['35.6585 139.7022', { lat: 35.6585, lng: 139.7022 }],
    ['https://www.google.com/maps/@35.6585,139.7022,17z', { lat: 35.6585, lng: 139.7022 }],
    ['https://www.google.com/maps/place/X/@35.6,139.7,17z/data=!3d35.658581!4d139.702228', { lat: 35.658581, lng: 139.702228 }],
    ['https://maps.google.com/?q=35.6585,139.7022', { lat: 35.6585, lng: 139.7022 }],
    ['https://www.google.com/maps/dir/?api=1&destination=35.6585%2C139.7022', { lat: 35.6585, lng: 139.7022 }],
  ])('reads %s', (input, expected) => {
    expect(parseCoordinates(input)).toEqual(expected)
  })
  it('rejects nonsense and out-of-range values', () => {
    expect(parseCoordinates('Shibuya Sky')).toBeNull()
    expect(parseCoordinates('135.6, 139.7')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
  })
})
