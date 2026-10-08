# Tabi (旅)

A private, mobile-first trip planner for one family's Tokyo trip. Static site on GitHub Pages + Supabase.

## Local development

Requirements: Node 22+, Docker Desktop (running).

```bash
npm install
npm run db:start      # starts local Supabase; prints URL + keys
```

Copy `.env.example` to `.env.local` and fill in the values printed by `db:start`
(`PUBLISHABLE_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY` → `SUPABASE_SECRET_KEY`). Then:

```bash
npm run db:reset      # apply migrations
npm run seed:dev      # optional sample family + Tokyo places
npm run db:types      # regenerate src/lib/database.types.ts after schema changes
npm run dev           # http://localhost:5173
```

Local Studio (DB browser): http://127.0.0.1:54323. Test emails (confirmations, password resets) are caught at
http://127.0.0.1:54324.

The service worker (install, offline) only runs in a production build: `npm run build && npm run preview`, then
open http://localhost:4173. In DevTools → Application you can see the cache, IndexedDB (`tabi.queryCache`,
`tabi.outbox`) and toggle *Offline*.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run db:test && npm run build
```

## Production setup (one time)

Your site will live at `https://<github-user>.github.io/<repo>/` (for this repo: `https://dswya.github.io/tabi/`).

1. **Create the Supabase project.** supabase.com → *New project* → pick a name (e.g. `tabi`), a strong **database
   password** (save it in your password manager — step 3 asks for it) and a region near you → *Create new project*.
2. **Auth settings** (left sidebar → *Authentication*):
   - *Sign In / Providers → Email*: Email enabled, **Confirm email on** (owner-admin only trusts confirmed
     addresses), minimum password length **8** → *Save*.
   - *URL Configuration*: **Site URL** = your Pages URL; under **Redirect URLs** add the same URL → *Save*.
     Confirmation and password-reset emails return there.
   - Leave *Realtime → Settings → Allow public access* **on** (the default): live updates use a channel that only
     ever delivers rows RLS lets you read; the whiteboard uses a private, members-only channel.
   - Optional: Supabase's built-in mailer only sends a few emails per hour. That's enough for a family of four; if
     emails stop arriving, add your own SMTP under *Authentication → Emails → SMTP Settings*.
3. **Apply the schema** (on your computer, in this repo, Node 22+):
   ```bash
   npx supabase login                                 # opens the browser to authorize the CLI
   npx supabase link --project-ref <your-project-ref> # the id in your dashboard URL; asks for the DB password
   npx supabase db push                               # applies everything in supabase/migrations
   ```
4. **Make yourself the admin + get the family code:** dashboard → *SQL Editor* → *New query* → run
   ```sql
   select public.add_admin_email('you@example.com');  -- your real email
   select code from family_invite;                     -- or: update family_invite set code = 'YOUR-CODE';
   ```
   Whoever signs up with that (confirmed) email is always an admin, and nobody else becomes admin by joining
   first. You can add more owner emails the same way. Owner emails live only in the database, never in git.
5. **GitHub:** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
   *Settings → Secrets and variables → Actions → Variables* tab → *New repository variable*, twice:
   `VITE_SUPABASE_URL` (Supabase *Project Settings → Data API*, "Project URL" — just `https://<project-ref>.supabase.co`,
   no `/rest/v1/`) and `VITE_SUPABASE_PUBLISHABLE_KEY` (*Project Settings → API Keys*, the `sb_publishable_…` key).
   Both are baked into the build: after changing one, re-run the deploy (*Actions → Deploy to GitHub Pages → Run
   workflow*). These are public by design; RLS protects the data.
   **Never** put the secret/service-role key in GitHub variables or any `VITE_` variable.
6. **Deploy:** merge into `main` (or push to it). *Actions* tab → "Deploy to GitHub Pages" runs lint, tests and the
   build with `BASE_PATH=/<repo>/`, then publishes. Re-run it any time with *Run workflow*.
7. **Join.** Open the site, enter the family code, create your account with the owner email, then click the
   confirmation link in your inbox (same device, same browser). You land in the app as admin — *Family admin*
   appears in the menu. Share the link + code with the family. Once everyone has joined, switch **Open to new
   members** off in *Family admin*.
8. **Install it** (each phone): Android/Chrome → menu → *Install app* (or *Add to Home screen*); iPhone/Safari →
   Share → *Add to Home Screen*. It then opens full-screen, works offline with the last data it saw, and queues
   changes made offline until the connection is back.

Later deploys: merge/push to `main`. Open apps show "A new version of Tabi is ready — Reload". Schema changes need
`npx supabase db push` **before** the new site goes live.

Do not run `seed:dev` against the production project.

## Troubleshooting

- `npm run db:start` fails pulling images (registry blocked on your network): run
  `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start` to pull from Docker Hub instead.
- The family-code screen says "Couldn't reach the server": the site was built with a wrong `VITE_SUPABASE_URL` or
  key. Check both variables (step 5), re-run the deploy, then hard-refresh the site (Ctrl+F5, twice — the app caches
  itself). The build log (*Actions* → the run → *build* → *Run npm run build*) shows the values it used.
- `supabase db push` says "Cannot find project ref": run it from the repo's top folder after `supabase link`, or skip
  linking with `npx supabase db push --db-url "<Session pooler connection string>"` (dashboard → *Connect* → *Direct*
  → *Session pooler*, port 5432, password filled in).
- A reset or confirmation link "does nothing": it must be opened in the same browser that asked for it (PKCE), and
  the site URL must be listed under *Authentication → URL Configuration → Redirect URLs*.
