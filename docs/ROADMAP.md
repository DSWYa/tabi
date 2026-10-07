# Roadmap

## Phase 1 — Foundation ✅
- [x] Vite + React + TS + Tailwind project, lint/test/build tooling
- [x] Design system: light (cream/orange) + dark (deep purple) tokens, light/dark/system switching, logo + mascot
- [x] Responsive shell: desktop sidebar, mobile bottom nav + More sheet, quick-add FAB, hash routing, lazy map/whiteboard routes
- [x] Full database schema with RLS, guard triggers, RPCs, storage buckets, realtime publication
- [x] pgTAP permission tests; dev seed script (4 members, 15 places, itinerary, travel info)
- [x] Family-code screen wired to `check_family_code`
- [x] GitHub Pages workflow; project docs

## Phase 2 — Accounts & core data ✅
- [x] Family code → sign up / sign in → `join_family`; session handling; remove DEV preview bypass
- [x] Profile: display name, avatar upload (≤10 MB source, resized client-side to a ~KB WebP), theme synced to profile
- [x] Pin color picker with taken colors disabled; realtime updates; graceful conflict on simultaneous pick
- [x] Notification preferences UI
- [x] Admin: trip name/dates, view/rotate family code, member list, roles, remove member
- [x] Extend pgTAP tests (storage, suggestions review, role RPCs) + unit tests for join flow and pin conflicts
- [x] Also: profile hardening migration (avatar path/name/prefs checks), typed Supabase client (`npm run db:types`),
      live trip countdown on the dashboard

## Phase 3 — Places, voting, plans & map ✅
- [x] Places list + create/edit/delete (owner/admin), categories, priority, JPY/USD with cached rate
- [x] Geocoding via Nominatim with shared DB cache + manual pin correction
- [x] Voting page with per-member votes, admin Add to Plan / Reject
- [x] Current Plans page
- [x] Leaflet map: member/category pins, clustering, filters, fit bounds, detail sheet, Google Maps directions
- [x] Dashboard cards wired to live data
- [x] Also: realtime for places/votes/itinerary (+ full refetch after a reconnect), URL-driven place sheet
      (`?place=<id>`, works from any page, Back closes it), search/filter/sort, admin Undo on decisions,
      pin editor accepts pasted Google Maps links, estimated spend on Current Plans, data-shape migration
      (http(s)-only websites, pin ⇔ geocode status, normalized cache keys) + pgTAP tests

## Phase 4 — Itinerary, whiteboard & travel info ✅
- [x] Timeline + calendar views, drag/drop (dnd-kit) with touch-friendly fallback, reservations
- [x] Admin "Schedule…" from Current Plans / the place sheet (read side is done: `lib/itinerary.ts`)
- [x] Itinerary suggestions + admin approve/reject
- [x] Excalidraw whiteboard with realtime sync and image uploads (≤5 MB)
- [x] Travel Info editor (create/rename/reorder/delete sections)
- [x] Quick-add actions open real forms
- [x] Also: URL-driven itinerary sheet (`?item=`, `?schedule=`, `?suggest=1`, works from any page), atomic
      `review_itinerary_suggestion` RPC (approving a still-voting place adds it to the plan), server-side
      renumbering RPCs for itinerary + Travel Info order, "move up/down" that crosses slots and days, members
      "Suggest a change" on any entry, private members-only whiteboard broadcast channel (RLS on
      `realtime.messages`), live cursors, "Add idea" sticky-note form, self-hosted Excalidraw fonts, tappable
      links/phone numbers in Travel Info, whiteboard grant fix (members really can only write elements/files),
      no SVG uploads, pgTAP + unit tests for all of it

## Phase 5 — Offline, notifications, polish & deploy
- [ ] PWA (installable), offline read cache, outbox queue + "Pending sync" UI
- [ ] Realtime across all data
- [ ] Notifications (DB triggers + in-app center; optional web push)
- [ ] Accessibility, performance and mobile QA passes
- [ ] Production Supabase setup + first GitHub Pages deploy
- [ ] "Forgot password" flow (reset email → set new password screen)
- [ ] Clean up a removed member's avatar files (Storage API; SQL can't delete objects)
- [ ] Optional admin toggle for `family_invite.enabled` ("close the family" once everyone has joined)
- [ ] Main chunk is ~170 kB gzip after Phase 4; lazy-load Voting/Plans/Admin if it keeps growing
- [ ] Offline: queue place creates/votes in the outbox; geocoding already retries pending places on next load
- [ ] Notifications for itinerary changes and suggestion submitted/reviewed (kinds already exist in the DB)
- [ ] Whiteboard: delete images no element references any more (Storage API, like avatars); offline edits are
      kept in memory only today (saved on reconnect while the tab stays open)
- [ ] Whiteboard: cache the scene for offline reading; consider lazy-loading the CJK font subset only when needed
- [ ] Itinerary: optional "sort this slot by time" button for the admin
