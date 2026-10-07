import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CATEGORIES, DAY_SLOTS, GEOCODE_STATUSES, NOTIFICATION_KINDS, PIN_COLORS, PLACE_STATUSES, RESERVATION_STATUSES,
  SUGGESTION_STATUSES, TRAVEL_ICONS, VOTES,
} from './constants'

// The DB enforces these values with CHECK constraints; keep both sides in sync.
const dir = resolve(process.cwd(), 'supabase/migrations')
const migration = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(resolve(dir, f), 'utf8'))
  .join('\n')

describe.each([
  ['categories', CATEGORIES.map((c) => c.key)],
  ['pin colors', PIN_COLORS.map((c) => c.key)],
  ['place statuses', PLACE_STATUSES.map((s) => s.key)],
  ['notification kinds', NOTIFICATION_KINDS.map((n) => n.key)],
  ['votes', VOTES.map((v) => v.key)],
  ['geocode statuses', GEOCODE_STATUSES.map((g) => g.key)],
  ['day slots', DAY_SLOTS.map((d) => d.key)],
  ['reservation statuses', RESERVATION_STATUSES.map((r) => r.key)],
  ['suggestion statuses', SUGGESTION_STATUSES.map((s) => s.key)],
  ['travel icons', TRAVEL_ICONS.map((i) => i.key)],
])('%s', (_name, keys) => {
  it('are unique', () => expect(new Set(keys).size).toBe(keys.length))
  it('match the database constraint', () => {
    for (const key of keys) expect(migration).toContain(`'${key}'`)
  })
})

it('pin colors are distinct hex values', () => {
  const hexes = PIN_COLORS.map((c) => c.hex.toLowerCase())
  expect(new Set(hexes).size).toBe(hexes.length)
})

it('notification defaults match notification_defaults() in the database', () => {
  const match = migration.match(/function public\.notification_defaults\(\)[\s\S]*?select '(\{[^']*\})'::jsonb/)
  expect(match).not.toBeNull()
  const sql = JSON.parse(match![1]) as Record<string, boolean>
  expect(sql).toEqual(Object.fromEntries(NOTIFICATION_KINDS.map((n) => [n.key, n.default])))
})
