// Dev seed: four fictional family members + sample Tokyo data.
//   npm run seed:dev     -> clear previous seed, then insert fresh data
//   npm run seed:clear   -> remove everything the seed created
// Needs SUPABASE_URL + SUPABASE_SECRET_KEY (from .env.local). Refuses non-local URLs
// unless --allow-remote is passed. NEVER run against the family's production project:
// the seed admin would become the trip admin.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
const args = new Set(process.argv.slice(2))

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (see .env.example).')
  process.exit(1)
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) && !args.has('--allow-remote')) {
  console.error(`Refusing to seed ${url}. Pass --allow-remote if this is a throwaway dev project.`)
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const SEED_DOMAIN = '@tabi.test'
const PASSWORD = 'tabi-dev-password'
const DEV_CODE = 'TOKYO-DEV'

const MEMBERS = [
  { name: 'Morgan', email: `morgan${SEED_DOMAIN}`, role: 'admin', pin: 'tangerine', theme: 'system' },
  { name: 'Casey', email: `casey${SEED_DOMAIN}`, role: 'member', pin: 'sky', theme: 'light' },
  { name: 'Riley', email: `riley${SEED_DOMAIN}`, role: 'member', pin: 'violet', theme: 'dark' },
  { name: 'Jamie', email: `jamie${SEED_DOMAIN}`, role: 'member', pin: 'matcha', theme: 'system' },
]

// [name, category, priority, price ¥, address, website, lat, lng, status, added by]
const PLACES = [
  ['teamLab Planets TOKYO', 'attraction', 5, 3800, '6-1-16 Toyosu, Koto City, Tokyo', 'https://www.teamlab.art/e/planets/', 35.6492, 139.7898, 'in_plan', 'Riley'],
  ['Meiji Jingu', 'shrine', 4, 0, '1-1 Yoyogikamizonocho, Shibuya City, Tokyo', 'https://www.meijijingu.or.jp/en/', 35.6764, 139.6993, 'in_plan', 'Morgan'],
  ['Takeshita Street', 'shopping', 3, 3000, '1 Chome Jingumae, Shibuya City, Tokyo', null, 35.6716, 139.7031, 'in_plan', 'Jamie'],
  ['Senso-ji', 'shrine', 5, 0, '2-3-1 Asakusa, Taito City, Tokyo', 'https://www.senso-ji.jp/', 35.7148, 139.7967, 'in_plan', 'Casey'],
  ['Shinjuku Gyoen', 'park', 3, 500, '11 Naitomachi, Shinjuku City, Tokyo', null, 35.6852, 139.7101, 'in_plan', 'Casey'],
  ['Pokémon Center Mega Tokyo', 'anime', 4, 5000, 'Sunshine City Alpa 2F, 3-1-2 Higashiikebukuro, Toshima City, Tokyo', null, 35.7289, 139.7193, 'in_plan', 'Jamie'],
  ['Shibuya Sky', 'attraction', 5, 2500, '2-24-12 Shibuya, Shibuya City, Tokyo', 'https://www.shibuya-scramble-square.com/sky/', 35.6585, 139.7022, 'awaiting', 'Casey'],
  ['Omoide Yokocho', 'food', 4, 3000, '1-2 Nishishinjuku, Shinjuku City, Tokyo', null, 35.6929, 139.6995, 'awaiting', 'Morgan'],
  ['Ghibli Museum', 'museum', 5, 1000, '1-1-83 Shimorenjaku, Mitaka, Tokyo', 'https://www.ghibli-museum.jp/en/', 35.6962, 139.5704, 'awaiting', 'Riley'],
  ['Akihabara Radio Kaikan', 'anime', 3, 4000, '1-15-16 Sotokanda, Chiyoda City, Tokyo', null, 35.6982, 139.7714, 'awaiting', 'Jamie'],
  ['Ichiran Shibuya', 'food', 3, 1200, '1-22-7 Jinnan, Shibuya City, Tokyo', null, 35.6614, 139.6993, 'awaiting', 'Riley'],
  ['Golden Gai', 'nightlife', 2, 2500, '1-1 Kabukicho, Shinjuku City, Tokyo', null, 35.6938, 139.7046, 'awaiting', 'Morgan'],
  ['Spa LaQua', 'relaxation', 2, 3230, '1-1-1 Kasuga, Bunkyo City, Tokyo', null, 35.7067, 139.7530, 'awaiting', 'Casey'],
  ['Tokyo Disneyland', 'entertainment', 2, 9400, '1-1 Maihama, Urayasu, Chiba', null, 35.6329, 139.8804, 'rejected', 'Jamie'],
  ['Café Kitsuné Aoyama', 'cafe', 3, 900, '3-17-1 Minami-Aoyama, Minato City, Tokyo', null, null, null, 'awaiting', 'Riley'],
]

const VOTES = {
  'Shibuya Sky': { Morgan: 'yes', Casey: 'yes', Riley: 'yes', Jamie: 'maybe' },
  'Omoide Yokocho': { Morgan: 'yes', Casey: 'maybe', Riley: 'no' },
  'Ghibli Museum': { Riley: 'yes', Jamie: 'yes', Casey: 'yes' },
  'Akihabara Radio Kaikan': { Jamie: 'yes', Riley: 'yes', Morgan: 'maybe', Casey: 'no' },
  'Ichiran Shibuya': { Riley: 'yes' },
}

// [day, slot, start, place name | null, title | null, reservation, ref, reservation time]
const ITINERARY = [
  ['2026-11-22', 'morning', '09:00', 'Meiji Jingu', null, 'none', null, null],
  ['2026-11-22', 'morning', '11:00', 'Takeshita Street', null, 'none', null, null],
  ['2026-11-22', 'afternoon', '14:00', 'Shinjuku Gyoen', null, 'none', null, null],
  ['2026-11-22', 'evening', '18:30', null, 'Dinner near the hotel', 'required', null, '18:30'],
  ['2026-11-23', 'morning', '08:30', 'Senso-ji', null, 'none', null, null],
  ['2026-11-24', 'afternoon', '15:00', 'teamLab Planets TOKYO', null, 'booked', 'TLP-48213', '15:00'],
  ['2026-11-25', 'afternoon', '13:00', 'Pokémon Center Mega Tokyo', null, 'none', null, null],
]

const TRAVEL_SECTIONS = [
  ['Flights', 'plane', 'Outbound: XX 123 · Nov 19, departs 11:05, arrives HND Nov 20 15:30\nReturn: XX 124 · Nov 29, departs HND 17:10\n\nOnline check-in opens 24h before.'],
  ['Hotel / Accommodation', 'hotel', 'Sample Hotel Shinjuku\n1-2-3 Nishishinjuku, Shinjuku City, Tokyo\nCheck-in 15:00 · Check-out 11:00\nBooking ref: SAMPLE-0001'],
  ['Transportation', 'train', 'Get a Suica or PASMO in Apple Wallet / Google Wallet before landing.\nHaneda → Shinjuku: Keikyu + JR Yamanote (~45 min) or Limousine Bus.'],
  ['Tax-Free Shopping Procedures', 'receipt', 'Spend ¥5,000+ (excl. tax) in one store on one day.\nBring your passport to the register — the store registers the purchase electronically.\nKeep consumables sealed until you leave Japan.'],
  ['Emergency Information', 'siren', 'Police: 110\nFire / Ambulance: 119\nJapan Visitor Hotline (24h, English): 050-3816-2787'],
  ['Useful Tokyo Information', 'info', 'Trains stop around midnight.\nCarry some cash — smaller restaurants may be cash-only.\nNo tipping.'],
]

async function check(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function seedUserIds() {
  const ids = []
  for (let page = 1; ; page++) {
    const { users } = await check(db.auth.admin.listUsers({ page, perPage: 200 }), 'list users')
    ids.push(...users.filter((u) => u.email?.endsWith(SEED_DOMAIN)).map((u) => u.id))
    if (users.length < 200) return ids
  }
}

async function clear() {
  const ids = await seedUserIds()
  if (ids.length) {
    await check(db.from('itinerary_items').delete().in('created_by', ids), 'clear itinerary')
    await check(db.from('places').delete().in('added_by', ids), 'clear places')
    await check(db.from('travel_sections').delete().in('updated_by', ids), 'clear travel info')
    await check(db.from('whiteboard').update({ elements: [], files: {} }).in('updated_by', ids), 'clear whiteboard')
    for (const id of ids) await check(db.auth.admin.deleteUser(id), 'delete user') // cascades profile, votes, …
  }
  await check(db.from('trip').update({ name: 'Tokyo Trip', start_date: null, end_date: null }).eq('id', 1), 'reset trip')
  console.log(`Cleared seed data (${ids.length} users).`)
}

async function seed() {
  await clear()

  const userId = {}
  for (const m of MEMBERS) {
    const { user } = await check(
      db.auth.admin.createUser({ email: m.email, password: PASSWORD, email_confirm: true }),
      `create ${m.name}`,
    )
    userId[m.name] = user.id
  }
  await check(
    db.from('profiles').insert(MEMBERS.map((m) => ({
      id: userId[m.name], display_name: m.name, role: m.role, pin_color: m.pin, theme: m.theme,
    }))),
    'profiles',
  )

  await check(
    db.from('trip').update({ name: 'Tokyo Family Trip', start_date: '2026-11-20', end_date: '2026-11-29' }).eq('id', 1),
    'trip',
  )
  await check(db.from('family_invite').update({ code: DEV_CODE }).eq('id', 1), 'family code')

  const placeRows = await check(
    db.from('places').insert(PLACES.map(([name, category, priority, price, address, website, lat, lng, status, by]) => ({
      name, category, priority, price_jpy: price, address, website, lat, lng, status,
      geocode_status: lat == null ? 'pending' : 'found',
      geocoded_address: lat == null ? null : address,
      added_by: userId[by],
      status_changed_by: status === 'awaiting' ? null : userId.Morgan,
      status_changed_at: status === 'awaiting' ? null : new Date().toISOString(),
    }))).select('id, name'),
    'places',
  )
  const placeId = Object.fromEntries(placeRows.map((p) => [p.name, p.id]))

  await check(
    db.from('votes').insert(Object.entries(VOTES).flatMap(([place, byMember]) =>
      Object.entries(byMember).map(([member, vote]) => ({ place_id: placeId[place], user_id: userId[member], vote })))),
    'votes',
  )

  await check(
    db.from('itinerary_items').insert(ITINERARY.map(([day, slot, start, place, title, reservation, ref, resTime], i) => ({
      day, slot, start_time: start, place_id: place ? placeId[place] : null, title,
      reservation_status: reservation, reservation_ref: ref, reservation_time: resTime,
      sort_order: i, created_by: userId.Morgan,
    }))),
    'itinerary',
  )

  await check(
    db.from('itinerary_suggestions').insert({
      place_id: placeId['Shibuya Sky'], day: '2026-11-24', slot: 'evening', start_time: '17:00',
      note: 'Sunset is around 16:30 — book the slot before!', suggested_by: userId.Casey,
    }),
    'suggestion',
  )

  await check(
    db.from('travel_sections').insert(TRAVEL_SECTIONS.map(([title, icon, body], i) => ({
      title, icon, body, sort_order: i, updated_by: userId.Morgan,
    }))),
    'travel info',
  )

  // A few notifications so the bell has something to show (triggers stay quiet for seed writes).
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
  await check(
    db.from('notifications').insert([
      { user_id: userId.Morgan, kind: 'suggestion_submitted', title: 'Casey suggested Shibuya Sky', body: 'Tue, Nov 24 · Evening, 17:00 — “Sunset is around 16:30 — book the slot before!”', link: '/itinerary', actor_id: userId.Casey, created_at: ago(30) },
      { user_id: userId.Morgan, kind: 'place_added', title: 'Riley added Café Kitsuné Aoyama', body: 'Have a look and cast your vote.', link: `/voting?place=${placeId['Café Kitsuné Aoyama']}`, actor_id: userId.Riley, created_at: ago(90) },
      { user_id: userId.Casey, kind: 'status_changed', title: 'Senso-ji is in the plan', body: 'Decided by Morgan.', link: `/places?place=${placeId['Senso-ji']}`, actor_id: userId.Morgan, created_at: ago(120) },
      { user_id: userId.Casey, kind: 'place_added', title: 'Riley added Café Kitsuné Aoyama', body: 'Have a look and cast your vote.', link: `/voting?place=${placeId['Café Kitsuné Aoyama']}`, actor_id: userId.Riley, created_at: ago(90), read_at: ago(60) },
    ]),
    'notifications',
  )

  console.log(`Seeded ${MEMBERS.length} members, ${PLACES.length} places, ${ITINERARY.length} itinerary items.`)
  console.log(`Family code: ${DEV_CODE}`)
  console.log(`Sign in as ${MEMBERS.map((m) => m.email).join(', ')} with password "${PASSWORD}".`)
}

try {
  await (args.has('--clear') ? clear() : seed())
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
