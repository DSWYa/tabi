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

## Phase 5 — Offline, notifications, polish & deploy ✅
- [x] PWA (installable): vite-plugin-pwa, manifest + icons (incl. maskable / Apple touch), works under the Pages
      `BASE_PATH`, precaches the app shell (entry, our lazy routes, Latin Excalidraw fonts; ~3 MB), runtime-caches
      the CJK font subsets, Excalidraw extras, avatars/whiteboard images and viewed OSM tiles; "New version — Reload"
      banner (never reloads on its own)
- [x] Offline read cache: TanStack Query cache persisted to IndexedDB (14 days, versioned, never the family code;
      cleared on sign-out or when another account signs in); pages keep showing cached data when a refresh fails
- [x] Outbox (IndexedDB) for place creates/edits, votes and itinerary suggestions: client UUIDs, strict order,
      edits folded into unsent creates, last vote wins, duplicate inserts treated as done, refused changes reported;
      Web Locks + BroadcastChannel across tabs; "Pending sync" chip + sheet, per-item badges, sign-out warning
- [x] Realtime across all data (added notifications and, for admins, the family invite)
- [x] Notifications written by DB triggers per recipient, respecting `notification_prefs` (place added, vote cast,
      status changed, itinerary changed, suggestion submitted/reviewed, upcoming reservation); bursts collapse;
      in-app center (`#/notifications`), bell with unread count, live toast
- [x] Reservation reminders without a scheduler: `send_reservation_reminders()` (members' apps call it hourly;
      each entry announced once per day, today/tomorrow in trip time)
- [x] "Forgot password" flow (reset email → "New password" screen → straight into the app)
- [x] Unused files cleaned up via the Storage API: removed members' avatars, replaced avatars, whiteboard images no
      longer on the board (a day's grace for Undo); daily per device + "Clean up unused files" for the admin
- [x] Admin toggle for `family_invite.enabled` ("Open to new members")
- [x] Accessibility pass (axe-core on every page, phone + desktop, light + dark): accent text contrast raised to
      ≥ 5:1, calendar day names, map cluster names, Leaflet attribution contrast, Excalidraw menu label
- [x] Performance pass: Voting, Plans, Itinerary, Travel Info, Settings, Admin and Notifications are lazy routes
      (entry chunk 173 → 104 kB gzip; ~215 kB gzip of JS on first load including the shared chunks it preloads)
- [x] Mobile QA (390 px screenshots of every page, offline/online round trip, two-member realtime)
- [x] Whiteboard: the last board seen is kept on the device and shown read-only offline (fonts + seen images
      included); CJK font subsets are only fetched when CJK text is drawn, then cached
- [x] Production Supabase setup + first GitHub Pages deploy (live at https://dswya.github.io/tabi/; owner steps in README)
- [x] Post-launch fixes: the phone shell is exactly one screen tall and only `<main>` scrolls, so the bottom bar can't
      drift on Android foldables; Whiteboard ("Board") joins the bottom bar; a `/rest/v1/` or trailing slash in
      `VITE_SUPABASE_URL` is tolerated

## Later (not scheduled)
- Optional web push (needs VAPID keys + a Supabase Edge Function; in-app notifications cover the family for now)
- Itinerary: optional "sort this slot by time" button for the admin
- Offline whiteboard *editing* (today: view-only offline; edits made while the tab is open but the connection
  drops are still kept in memory and saved on reconnect)
- Background Sync (send the outbox while the app is closed) — today it's sent the next time the app is open
