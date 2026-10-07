# Data model

Source of truth: `supabase/migrations/`. Permission tests: `supabase/tests/`.
TypeScript types: `src/lib/database.types.ts`, regenerated with `npm run db:types` after every schema change.
Helpers: `is_member()` (has a profile), `is_admin()`, `place_is_open(place_id)` (status = awaiting).
Anon role has **no** table access; only `check_family_code()` is executable by anon.

## Tables

| Table | Key fields | Read | Write |
|---|---|---|---|
| `trip` (singleton) | name, destination, start_date, end_date, timezone | members | admin update |
| `family_invite` (singleton) | code, enabled | admin | admin update / `rotate_family_code()` |
| `profiles` | id → auth.users, display_name (not blank), avatar_path (must be `<own id>/…`), role, pin_color (UNIQUE), theme, notification_prefs jsonb (`{kind: boolean}` only) | members (+ own row) | own row, columns display_name/avatar_path/pin_color/theme/notification_prefs only. Insert only via `join_family`. Role via `set_member_role` |
| `places` | name (not blank), category, priority 1–5, price_jpy ≥ 0, address, website (http(s) only), notes, status, lat/lng, geocode_status (pin exists ⇔ `found`/`manual`), geocoded_address, added_by, status_changed_by/at | members | insert: members (forced `awaiting`, `added_by = me`); update/delete: owner or admin (incl. moving the pin); status change: admin only (trigger, records who/when) |
| `votes` | PK (place_id, user_id), vote yes/maybe/no | members | own vote only, only while place is `awaiting` |
| `itinerary_items` | place_id?, title? (not blank), day, slot (morning/afternoon/evening), start_time, end_time, sort_order (admin's order inside the slot), notes, reservation_status (required/booked/none), reservation_ref (not blank), reservation_time — ref/time only when a reservation is required/booked; created_by (forced, immutable) | members | admin (order via `move_itinerary_item`) |
| `itinerary_suggestions` | either a new stop (place_id? / title?) **or** a move of an existing entry (item_id, no place/title), day, slot, start_time, note, status (pending/approved/rejected), suggested_by, reviewed_by/at, review_note | members | insert: members (forced pending); owner edits/deletes while pending; review: admin only (trigger), normally via `review_itinerary_suggestion` |
| `travel_sections` | title (not blank), icon (one of `TRAVEL_ICONS`), body (plain text, links/phones made tappable in the UI), sort_order, updated_by (forced) | members | admin (order via `move_travel_section`) |
| `notifications` | user_id (recipient), kind, title, body, link, actor_id, read_at | own | own `read_at` / delete; inserts by DB triggers only |
| `whiteboard` (singleton) | elements jsonb (array, ≤ 8 MB), files jsonb `{fileId:{path: "<uuid>.<png/jpg/webp/gif>", mimeType}}` (checked by `whiteboard_files_valid`), version (auto++ on every save), updated_by (forced) | members | members, columns elements/files only |
| `admin_emails` | email (lowercase) PK | nobody (no grants) | SQL editor / service role only, via `add_admin_email()` |
| `geocode_cache` | query PK (normalized: trimmed, single-spaced, no capitals), found (⇔ lat/lng set), lat, lng, display_name | members | members insert; nobody updates/deletes (SQL editor only) |

Enums mirrored in `src/lib/constants.ts` (unit test checks they match the migration).

## Ordering
Itinerary entries are grouped by day → slot; inside a slot the admin's `sort_order` decides (times are shown but
don't reorder what the admin arranged). `move_itinerary_item` puts an entry at a position in a day + slot and
renumbers that slot 0..n; new or re-timed entries are placed by time (`itinerary_sort_order_for`: before the first
entry that starts later, else last). Travel Info sections use the same renumbering via `move_travel_section`.
The browser mirrors these rules in `lib/itinerary.ts` / `lib/reorder.ts` for optimistic updates (unit tested).

## Relationships
- `profiles.id` → `auth.users.id` (cascade). Deleting a profile cascades votes, suggestions, notifications;
  sets `places.added_by`, `itinerary_items.created_by` etc. to null.
- `votes.place_id`, `itinerary_suggestions.place_id` → places (cascade); `itinerary_items.place_id` → places (set null).
- Workflow: place `awaiting` → votes → admin sets `in_plan`/`rejected` → itinerary item ⇒ "Scheduled" (derived) → `visited`.
  The admin can also send a place back to voting (`awaiting`), which reopens votes (existing votes are kept).

## Geocoding
A place starts `pending` (no pin). Any member who may edit it (creator or admin) geocodes it in the background
(`useGeocodePendingPlaces`): a few progressively looser queries (full address → name + neighbourhood → name + city →
neighbourhood), each looked up in `geocode_cache` first, then Nominatim (≤ 1 request/s, `countrycodes=jp`). Every
definitive answer — hit or miss — is cached; outages are not, so the place stays `pending` and is retried later.
The result is written only `where geocode_status = 'pending'`, so it never overwrites a hand-placed pin.
Editing the address resets a `found`/`not_found` place to `pending`; a `manual` pin is kept until someone asks for a
new lookup in the pin editor.

## RPCs
| Function | Caller | Purpose |
|---|---|---|
| `check_family_code(code)` | anon, authenticated | boolean; case/punctuation-insensitive |
| `join_family(code, display_name)` | authenticated | creates profile; owner email (confirmed) → admin, else first joiner → admin only if no owner email is configured; idempotent (promotes an existing owner) |
| `add_admin_email(email)` | SQL editor only | registers an owner email; promotes that member now if they already joined |
| `rotate_family_code()` | admin | new random code, returned |
| `set_member_role(target, role)` | admin | can't remove the last admin |
| `remove_member(target)` | admin | deletes profile (not the auth user); can't remove self |
| `move_itinerary_item(item_id, to_day, to_slot, to_index)` | admin | moves an entry; renumbers the target slot; advisory-locked |
| `review_itinerary_suggestion(suggestion_id, approve, review_note?)` | admin | one transaction: approve applies it (new entry placed by time, or moves the entry) and adds a still-awaiting/rejected place to the plan; reject just records it. Returns the entry id (null on reject). Errors: `P0002` gone, `55000` already reviewed |
| `move_travel_section(section_id, to_index)` | admin | reorders Travel Info; renumbers all sections |

## Storage
| Bucket | Public | Limit | Path | Write |
|---|---|---|---|---|
| `avatars` | yes (unguessable paths) | 2 MB, jpeg/png/webp | `<uid>/<uuid>.webp` (256×256, made in the browser from a ≤10 MB source) | own folder only; the app deletes the previous file on change |
| `whiteboard` | yes (unguessable paths) | 5 MB, jpeg/png/webp/gif (no SVG) | `<uuid>.<png/jpg/webp/gif>`, no folders (insert policy) | members upload; uploader or admin delete |

Direct SQL deletes on `storage.objects` are blocked by Supabase's `protect_delete` trigger; the Storage API (and the
pgTAP tests, via `storage.allow_delete_query`) bypass it, and RLS still decides who may delete.

## Realtime
Publication `supabase_realtime` includes: trip, profiles, places, votes, itinerary_items,
itinerary_suggestions, travel_sections, notifications, whiteboard. Realtime respects RLS.
The app subscribes to `profiles`, `trip`, `places`, `votes`, `itinerary_items`, `itinerary_suggestions` and
`travel_sections` (`useCoreRealtime`) and simply refetches the affected query on any event; after a dropped
connection it refetches everything once.

The whiteboard uses its own **private** broadcast channel, topic `whiteboard`. RLS policies on `realtime.messages`
let only members join it or send on it (a public subscriber to the same topic receives nothing; a signed-in
non-member is refused). It carries changed elements, new image file entries and cursor positions; the saved row
(postgres_changes on `whiteboard`) is the durable fallback.
