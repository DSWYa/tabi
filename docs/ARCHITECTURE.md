# Architecture

## Shape
```
GitHub Pages (static SPA, hash routes)  ──HTTPS──>  Supabase
  React + TanStack Query                              Auth (email/password)
  Service worker + IndexedDB (cache, outbox)          Postgres + RLS  ← all permissions live here
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
- **Offline:** three layers, each doing one job.
  - *Service worker* (vite-plugin-pwa, `registerType: 'prompt'`): precaches the app shell — the entry, every lazy
    route/component *we* import (computed from the bundle graph in `vite.config.ts`), CSS, icons and the Latin
    Excalidraw fonts (~3 MB). Runtime cache-first for the CJK font subsets and Excalidraw's optional extras (Mermaid,
    export worker), Storage images (unguessable, never rewritten paths) and OSM tiles already viewed. It never caches
    Supabase API responses. `UpdatePrompt` offers "Reload" when a new build is waiting; it never reloads on its own.
  - *Reads:* the TanStack Query cache is persisted to IndexedDB (`lib/queryPersist.ts`, throttled, 14 days,
    versioned by `CACHE_BUSTER`). The family code and the whiteboard row are never written there. Sign-out, or a
    different account signing in on the device (`claimCache`), wipes it. Pages show cached data when a refresh fails
    and only show an error when there is nothing cached. The whiteboard keeps its own copy of the last board it saw
    and opens it read-only offline.
  - *Writes:* the outbox (`lib/outbox.ts` pure core + `lib/outboxRuntime.ts`): place create/update, votes and
    itinerary suggestions are queued in IndexedDB first and sent in order (`useOutboxSync`: on start, on `online`,
    every 30 s while something waits). Rows carry client-generated UUIDs, so a re-sent insert that hits `23505` is
    "already there"; edits are last-write-wins. Queueing folds an edit of an unsent place into its creation and keeps
    one vote per place. What's still waiting is overlaid on the server data with each query's `select`
    (`applyPlaceOps`, …), so it survives refetches and reloads; once sent, the entry is written into the raw cache
    before it leaves the queue (no flicker). Connection problems (status 0/5xx/401, timeouts) keep it queued;
    anything the database refuses is dropped and reported (inline when you're watching, otherwise in the "Pending
    sync" sheet). Web Locks + a BroadcastChannel keep several tabs from sending the same entry. Deleting a place or
    withdrawing a suggestion that was never sent just drops it from the queue.
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
- **Notifications** are rows written by DB triggers per recipient (`notify()`), respecting
  `profiles.notification_prefs` (defaults in `notification_defaults()`, mirrored by `NOTIFICATION_KINDS`). Nobody is
  told about their own action; writes without a signed-in member (seed, SQL editor) notify nobody; a burst about the
  same thing from the same person within 10 minutes refreshes one unread row instead of adding more. Itinerary
  reordering inside a slot isn't news. Reservation reminders need no scheduler: members' apps call
  `send_reservation_reminders()` hourly and the database announces each booking once per day it's on (today/tomorrow,
  trip time zone). The app reads them in `#/notifications` (bell + unread count in the shell) and shows a toast when
  one arrives live. Web push is not built (see ROADMAP "Later").
- **Unused files:** SQL can't delete Storage objects, so `unused_storage_objects()` lists what the caller may delete
  (admins: avatars no profile uses — e.g. a removed member's — and whiteboard images the saved board no longer
  references, after a day's grace; members: only their own) and the app deletes them through the Storage API, where
  RLS checks each one again (`lib/storageCleanup.ts`, daily per device + an admin button).

## Auth & join flow
```
Gate (no session)                 family code -check_family_code-> Create account | Sign in
                                  saves {code, name} to localStorage ("join intent") before signUp
JoinFamily (session, no profile)  join_family(code, name): automatic when intent + name are known,
                                  otherwise a short form (also what a removed member sees)
App (session + profile)           everything else; intent cleared
```
- Sessions persist in localStorage (`tabi.auth`), so returning users skip the gate. Sign-out clears the query cache
  (memory + IndexedDB), the outbox and the offline whiteboard copy; it warns first if changes are still unsent.
- **Forgot password:** the sign-in step links to "Reset your password" → `resetPasswordForEmail` (the reply never
  says whether the account exists). The emailed link returns as `?code=…` (PKCE, same browser); Supabase emits
  `PASSWORD_RECOVERY`, caught by a listener registered at import time (the code is exchanged while the client
  initializes), and `RequireMember` shows `ResetPassword` before anything else.
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
  The shell is exactly one screen tall and only `<main>` scrolls (scroll reset to the top on navigation); the bottom
  nav is an ordinary flex row. With the document scrolling and a `position: fixed` nav, some Android browsers
  (foldables) let the visual viewport pan and the nav drifted with the page.
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
- `src/pages/Admin.tsx` — admin-only tools (`#/admin`): trip, family code (+ "Open to new members" toggle for
  `family_invite.enabled`), members, Storage cleanup; the nav item is hidden for members, Postgres enforces the rules.
- Phase 5: `lib/queryPersist`, `lib/outbox` + `lib/outboxRuntime`, `lib/notifications`, `lib/storageCleanup`;
  `components/sync/SyncIndicator` (header/sidebar chip + sheet), `components/notifications/` (bell, toaster, icons),
  `components/UpdatePrompt`, `pages/Notifications`, `pages/ResetPassword`. Voting, Plans, Itinerary, Travel Info,
  Settings, Admin and Notifications are lazy routes (Dashboard, Places and the gate screens stay in the entry).
- Theme: `data-theme` on `<html>` (set pre-paint by an inline script in `index.html`), tokens in `src/index.css`.
