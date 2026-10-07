# Architecture

## Shape
```
GitHub Pages (static SPA, hash routes)  ──HTTPS──>  Supabase
  React + TanStack Query                              Auth (email/password)
  Service worker + IndexedDB (Phase 5)                Postgres + RLS  ← all permissions live here
                                                      Realtime (postgres_changes + broadcast)
                                                      Storage (avatars, whiteboard images)
Third-party, called from the browser:
  Frankfurter (JPY→USD, cached) · Nominatim/OSM (geocoding, cached in DB) · OSM tiles · Google Maps links (directions only)
```

## Why Supabase (over Firebase)
Our rules are relational: "only the creator edits a place", "only admin changes status", "one vote per
member per place, frozen after a decision", "each pin color owned by at most one member". In Postgres these are
RLS policies, column grants, triggers and a UNIQUE constraint — enforced server-side and testable with pgTAP.
Firestore rules would need denormalized docs and cannot enforce cross-document uniqueness without
transactions on the client. Supabase also bundles auth, realtime and storage, has a free tier that four
users will never exceed, and runs fully locally via the CLI + Docker.

## Key decisions
- **Single trip per deployment.** One `trip` row, one `whiteboard` row, one `family_invite` row (all `id = 1`).
  No `family_id` columns; membership is simply "has a `profiles` row". A second trip = a new Supabase project.
- **Family code** only unlocks joining. Signup is open at the Auth level, but an account without a profile can
  read nothing. `join_family` is the only path to a profile. Code is stored plaintext but readable only by
  admins (RLS); 10 hex chars by default, admin can rotate it.
- **Owner emails** guarantee the trip owner is admin without a "who joins first" race and without handling
  secret keys locally: one SQL-editor call stores the email; `join_family` checks the caller's *confirmed* email.
  Keep email confirmation on in production, or anyone with the family code could sign up as the owner's address.
- **Guard triggers** (`places_guard`, `suggestions_guard`) handle per-column rules RLS can't express
  (status changes, immutable `added_by`). They trust writes with no `auth.uid()` (service role / SQL editor).
- **Column grants** on `profiles` prevent members from setting `role` even on their own row.
- **Hash routing** instead of a 404.html redirect hack: simplest thing that survives refresh on GitHub Pages.
  `BASE_PATH` env sets Vite `base` for the repo subpath.
- **Storage buckets are public with unguessable paths** (`<uid>/<uuid>.webp`). Listing/upload require
  membership. Trade-off: anyone with an exact image URL can view it, but URLs are only obtainable after
  login. This keeps images cacheable offline (signed URLs change every time). Don't upload sensitive documents.
- **"Scheduled" is derived**, not a status: an `in_plan` place with ≥1 itinerary item.
- **Offline (Phase 5):** TanStack Query cache persisted to IndexedDB for reads; a small outbox queue in
  IndexedDB for writes (place create/update, votes, suggestions). Client-generated UUIDs make creates
  idempotent; conflicts are last-write-wins.
- **Whiteboard:** Excalidraw (MIT), lazy-loaded, fonts self-hosted (copied into the build by `vite.config.ts`).
  `components/whiteboard/session.ts` owns one editing session, outside React render:
  - *Live:* changed elements (version differs from what was last shared) are broadcast every ~60 ms on the
    private, members-only `whiteboard` channel; receivers merge with element-version reconciliation
    (`lib/whiteboardSync.ts`: higher `version` wins, tie → lower `versionNonce`, never replace what the user is
    editing, deletes are tombstones, order by fractional `index`). Remote merges never enter the undo stack.
  - *Durable:* the scene is saved ~1.5 s after the last change (max 6 s) to the `whiteboard` row with optimistic
    concurrency (`update … where version = <last seen>`). A conflict means someone saved in between: pull the
    row, merge, save again. Other clients pull on `postgres_changes`, which also covers joiners and reconnects.
    Tombstones older than a day are pruned on save. Elements too big to broadcast go through the row only.
  - *Images:* uploaded once as `<uuid>.<ext>` (≤ 5 MB, raster only); the row stores just `{fileId: {path, mimeType}}`
    and peers download from the public URL. Cursors are broadcast too and shown as Excalidraw collaborators.
- **Notifications** are rows written by DB triggers per recipient, respecting `profiles.notification_prefs`.
  In-app first; web push optional.

## Auth & join flow
```
Gate (no session)                 family code -check_family_code-> Create account | Sign in
                                  saves {code, name} to localStorage ("join intent") before signUp
JoinFamily (session, no profile)  join_family(code, name): automatic when intent + name are known,
                                  otherwise a short form (also what a removed member sees)
App (session + profile)           everything else; intent cleared
```
- Sessions persist in localStorage (`tabi.auth`), so returning users skip the gate. Sign-out clears the query cache.
- Supabase client uses **PKCE**: email-confirmation links return as `?code=…`, which can't collide with `#/` routes.
  If the hosted project requires email confirmation, the user lands back signed in and `JoinFamily` finishes the
  join from the saved intent (same browser) or the name stored in `user_metadata` at sign-up.
- Membership + "who am I" come from one query (`['profiles', uid]`, all four rows). Profile edits are optimistic.
- Theme: local preference applies instantly (pre-paint script); the profile's `theme` wins once loaded, and
  changes are written back, so it follows the member across devices.
- Pin colors: the UNIQUE constraint is the arbiter. A losing simultaneous pick gets `23505`; the picker refetches
  and says who got it first.

## Frontend layout
- `src/App.tsx` — router; `RequireMember` shows Gate / JoinFamily / the app depending on session + profile.
- `src/layout/AppShell.tsx` — sidebar (≥ lg), top bar + bottom nav + "More" sheet (< lg), global quick-add FAB.
- `src/lib/` — typed supabase client, auth/theme providers, `members` (profile queries + mutations), `trip`,
  `realtime`, `join` (pure join-flow helpers), `image` (avatar resize), `pinColors`, constants, formatting.
  Phase 3: `places` (queries + mutations, optimistic votes/status), `placeBoard` (places + votes + members joined),
  `votes` (pure tallies/consensus), `placeForm`/`placeFilters` (pure), `fx` (Frankfurter rate, 12 h cache in
  localStorage, stale rate when offline), `geocode` (pure: candidates, rate limiter, cache-first lookup) +
  `geocodeWorker` (Supabase cache adapter, background pinning), `maps` (directions links, coordinate parsing),
  `itinerary` (ordering, moves, "up next", derived "scheduled", mutations).
  Phase 4: `itineraryForm` (pure form rules), `suggestions` (queries, review, `previewApproval`), `travelInfo`,
  `reorder` (pure renumbering), `whiteboard` (row + Storage access), `whiteboardSync` (pure reconciliation), `linkify`.
- `src/components/places/` — card, form, detail, vote control, admin status buttons. **One** place sheet for the
  whole app (`PlaceSheetHost` in `AppShell`), driven by the URL: `?place=<id>[&view=edit|pin]` or `?new=1`, so the
  map, dashboard and Quick add can all open it and the phone's Back button closes it.
- `src/components/map/` — plain Leaflet (no React wrapper) + markercluster, both only in lazy chunks (map route
  and pin editor). Pins are `divIcon`s: member/category color + the category icon copied from hidden lucide
  sprites. Dark theme inverts the OSM tiles with a CSS filter. Marker updates are incremental (diffed by a
  per-pin signature) because wiping a cluster group mid-animation breaks markercluster.
- `src/components/itinerary/` — timeline (dnd-kit: drag by the handle, keyboard dragging, plus "move earlier/later"
  buttons that cross slots and days), calendar view, entry card/detail/form, suggestion form + review panel.
  **One** itinerary sheet for the app (`ItinerarySheetHost` in `AppShell`), URL-driven like the place sheet:
  `?item=<id>[&itemView=edit|suggest]`, `?schedule=<placeId>`, `?newItem=1`, `?suggest=1` (Quick add). Opening
  either sheet closes the other. Reorders call `move_itinerary_item` with an optimistic `applyMove`.
- `src/components/travel/`, `src/pages/TravelInfo.tsx` — sections with icon, plain-text body (`lib/linkify`),
  admin create/edit/delete and move up/down (`move_travel_section`).
- `src/pages/Whiteboard.tsx` + `src/components/whiteboard/` — full-bleed canvas (the shell drops page padding and
  the Quick-add button on this route), sync status, who's here, "Add idea" sticky-note form (`?idea=1`).
- `src/pages/Admin.tsx` — admin-only tools (`#/admin`); the nav item is hidden for members, Postgres enforces the rules.
- Theme: `data-theme` on `<html>` (set pre-paint by an inline script in `index.html`), tokens in `src/index.css`.
