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

Local Studio (DB browser): http://127.0.0.1:54323. Test emails are caught at http://127.0.0.1:54324.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run db:test && npm run build
```

## Production setup (one time)

1. **Supabase:** create a free project at supabase.com. In *Authentication → Sign In / Providers*, keep Email
   enabled. In *Authentication → URL Configuration*, set Site URL to your Pages URL
   (`https://<user>.github.io/<repo>/`) and add the same URL under *Redirect URLs* (email-confirmation links
   return there). In *Authentication → Sign In / Providers → Email*, set *Minimum password length* to 8.
   **Keep "Confirm email" on**: owner-admin (step 3) only trusts confirmed email addresses.
   Leave *Realtime → Settings → Allow public access* **on** (the default): live updates for places etc. use a
   public channel that only ever delivers rows RLS lets you read, and the whiteboard uses a private,
   members-only channel set up by the migrations.
2. **Apply the schema:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Make yourself the admin + get the family code:** Supabase dashboard → SQL Editor → run
   ```sql
   select public.add_admin_email('you@example.com');  -- your real email
   select code from family_invite;                     -- or: update family_invite set code = 'YOUR-CODE';
   ```
   Whoever signs up with that (confirmed) email is always an admin, and nobody else becomes admin by joining
   first. You can add more owner emails the same way. Owner emails live only in the database, never in git.
4. **GitHub:** push this repo to GitHub. *Settings → Pages → Source: GitHub Actions*.
   *Settings → Secrets and variables → Actions → Variables*: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys in Supabase). These are public by design;
   the database's row-level security is what protects data. **Never** put the secret/service-role key in GitHub
   variables or any `VITE_` variable.
5. Push to `main` → the workflow lints, tests, builds and deploys.
6. **Join.** Open the site, enter the family code and create your account with the owner email, then click the
   confirmation link in your inbox (same device). You land in the app as admin — check that *Family admin*
   appears in the menu. Change your password any time in *Profile & Settings → Account*. Then share the
   link + code with the family.

Do not run `seed:dev` against the production project.
