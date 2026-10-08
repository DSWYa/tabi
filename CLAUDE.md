# Tabi (旅) — private Tokyo trip planner

Private, mobile-first PWA for one family of four planning a Tokyo trip. Hosted as a static site on
GitHub Pages; reveals nothing about the trip until a user has an account and has joined via the family code.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

## Stack
- Vite + React 19 + TypeScript, Tailwind CSS v4 (tokens in `src/index.css`), lucide-react icons
- React Router 8 with **hash routing** (`createHashRouter`) — required for GitHub Pages refreshes
- TanStack Query for server state; no other state library
- Supabase: Auth (email/password), Postgres + RLS, Realtime, Storage. No custom server.
- Leaflet 1.9 + leaflet.markercluster (plain, imperative; lazy chunks only), Excalidraw 0.18 (lazy whiteboard route,
  self-hosted fonts), dnd-kit (itinerary)
- Offline: vite-plugin-pwa (service worker precaches the app shell), TanStack Query cache persisted to IndexedDB
  (`lib/queryPersist`), IndexedDB outbox for member writes (`lib/outbox` + `lib/outboxRuntime`), idb-keyval
- Browser-side services, no keys: Nominatim (geocoding, cached in `geocode_cache`, ≤1 req/s), Frankfurter (JPY→USD)

## Commands
```
npm run dev          # http://localhost:5173 (needs .env.local)
npm run db:start     # local Supabase in Docker (first run downloads images; if AWS/GHCR registries are blocked:
                     #   SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start)
npm run db:reset     # re-apply supabase/migrations to local DB
npm run seed:dev     # 4 fictional members + Tokyo sample data (seed:clear to remove)
npm run db:test      # pgTAP permission tests in supabase/tests
npm run db:types     # regenerate src/lib/database.types.ts from the local DB
npm test             # Vitest unit tests
npm run lint && npm run typecheck && npm run build
```
Local dev login after seeding: `morgan@tabi.test` (admin) / casey / riley / jamie, password `tabi-dev-password`, family code `TOKYO-DEV`.

## Auth & authorization model
- Anyone can sign up with Supabase Auth, but **membership = a row in `profiles`**, created only by the
  `join_family(code, display_name)` RPC after validating the family code. Non-members see nothing (RLS).
- Owner emails (`admin_emails`, set only via SQL editor: `select add_admin_email('…')`) always join as `admin`
  (confirmed email required) and disable "first joiner becomes admin". With no owner email, the first joiner is admin.
- Anonymous visitors can call only `check_family_code(code)` → boolean.
- **All rules are enforced in Postgres** (RLS + column grants + guard triggers + security-definer RPCs).
  Frontend checks are UX only. Never rely on the client for permissions.
- Admin-only: place status, itinerary items, reviewing suggestions, Travel Info, trip dates, family code, roles.
- Members: own profile, create places, edit/delete own places, own votes (only while place is `awaiting`), suggestions,
  the whiteboard (elements/files columns; live broadcast on the private `whiteboard` channel is members-only via RLS
  on `realtime.messages`).

## Conventions
- `@/` alias → `src/`. Pages in `src/pages`, shell in `src/layout`, shared UI in `src/components` (+ `ui/` primitives).
- Domain enums live in `src/lib/constants.ts` and MUST match DB CHECK constraints (a unit test enforces this).
- Colors only via theme tokens (`bg-surface`, `text-muted`, `bg-accent`…); never hard-code UI colors except category/pin colors.
- Never convey meaning by color alone — pair with icon/label (StatusBadge, CategoryBadge do this).
- Touch targets ≥ 44px (`min-h-11`/`size-11`). Modals use `<Sheet>` (native `<dialog>`).
- The shell is one screen tall (`h-dvh`) and only `<main>` scrolls; the phone bottom bar is a normal flex row, not
  `position: fixed`. Scroll position lives on `#main` (reset on navigation in `AppShell`), not on `window`.
- Heavy features (map, whiteboard) are `lazy()` routes.
- Schema changes: add a new file in `supabase/migrations/`, run `npm run db:reset && npm run db:types`, update
  `docs/DATA_MODEL.md`, add pgTAP tests for new rules.
- Data access: TanStack Query hooks in `src/lib/*` (e.g. `useMe`, `useTrip`, `usePlaceBoard`); user-facing error text via
  `friendlyError` / `placeErrorMessage`. RLS turns a forbidden UPDATE/DELETE into "0 rows": mutations `.select('id')` and
  treat an empty result as an error.
- Place sheets open via the URL (`usePlaceSheet()`: `?place=<id>`, `?new=1`), never local modal state. Same for the
  itinerary sheet (`useItinerarySheet()`: `?item=`, `?schedule=`, `?newItem=1`, `?suggest=1`); one sheet at a time.
- Admin-ordered lists (itinerary slots, Travel Info) are reordered by RPCs that renumber server-side; mirror the rule
  in a pure helper for the optimistic update (`applyMove`, `applySectionMove`).
- Use `mutateAsync` (not `mutate(vars, callbacks)`) when the calling component may unmount from an optimistic update.
- Member writes that must work offline (place create/update, votes, suggestions) go through `outbox.submit()` with a
  client UUID; the query's `select` overlays what's still queued (`applyPlaceOps`, …). Don't add optimistic
  `onMutate` patches for those — the overlay is the optimistic update. Admin actions stay online-only.
- Notifications are written only by DB triggers via `notify()`; a new kind needs the CHECK list, `NOTIFICATION_KINDS`,
  `notification_defaults()` and a pgTAP test.
- Never persist secrets in the query cache: add their first query-key segment to `NEVER_PERSIST` (`lib/queryPersist`).
- New in-app pages that aren't the first screen should be `lazy()` routes (the service worker precaches them anyway).
- Form inputs use `<Field>` / `<FormMessage>` from `components/ui/Field`.

## Working with the owner
- Only stop for credentials, account creation, owner-only actions, or decisions with real architectural impact.
- When the owner must do something, give exact numbered click-by-click steps (site, menu, button labels, values to paste, how to confirm it worked).
- End each phase with: run lint/typecheck/tests/db tests/build, update ROADMAP, a concise summary, and the next phase's prompt.

## Status
Phases 1–5 complete and deployed (foundation; accounts & admin tools; places, voting, plans & map; itinerary,
whiteboard & travel info; offline/PWA, notifications, polish). Live at https://dswya.github.io/tabi/.
Next ideas are listed under "Later" in ROADMAP.

## Deployment
GitHub Actions (`.github/workflows/deploy.yml`) builds on push to `main` with `BASE_PATH=/<repo>/` and
repo **variables** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design).
Migrations go to the hosted project via `npx supabase link` + `npx supabase db push`. Full steps in README.
