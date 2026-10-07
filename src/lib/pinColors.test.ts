import { PIN_COLORS } from './constants'
import { isPinConflict, pinColorOptions, pinConflictMessage } from './pinColors'

const members = [
  { id: 'me', display_name: 'Morgan', pin_color: 'tangerine' },
  { id: 'c', display_name: 'Casey', pin_color: 'sky' },
  { id: 'r', display_name: 'Riley', pin_color: null },
]

describe('pinColorOptions', () => {
  const options = pinColorOptions(members, 'me')
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]))

  it('lists all ten presets in order', () => {
    expect(options.map((o) => o.key)).toEqual(PIN_COLORS.map((c) => c.key))
  })
  it('marks my color as mine, not taken', () => {
    expect(byKey.tangerine).toMatchObject({ mine: true, takenBy: null })
  })
  it('marks colors owned by others with who has them', () => {
    expect(byKey.sky.mine).toBe(false)
    expect(byKey.sky.takenBy?.display_name).toBe('Casey')
  })
  it('leaves everything else available', () => {
    expect(options.filter((o) => !o.mine && !o.takenBy)).toHaveLength(8)
  })
})

describe('simultaneous picks', () => {
  it('recognises the unique-violation from Postgres', () => {
    expect(isPinConflict({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_pin_color_key"' })).toBe(true)
    expect(isPinConflict({ code: '42501' })).toBe(false)
    expect(isPinConflict(null)).toBe(false)
  })
  it('names the winner when we know them', () => {
    expect(pinConflictMessage('Sky', { display_name: 'Casey' })).toBe('Casey grabbed Sky a moment before you did — pick another color.')
    expect(pinConflictMessage('Sky', null)).toMatch(/^Someone grabbed Sky/)
  })
})
