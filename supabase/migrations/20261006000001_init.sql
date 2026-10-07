-- Tabi — initial schema.
-- Single-trip app: one `trip` row; membership == having a `profiles` row.
-- All authorization is enforced here (RLS, column grants, guard triggers, RPCs).

-- ============================================================================
-- Shared helpers
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================================
-- Trip (singleton) + family invite code (singleton, admin-only)
-- ============================================================================

create table public.trip (
  id          smallint primary key default 1 check (id = 1),
  name        text not null default 'Tokyo Trip' check (char_length(name) between 1 and 80),
  destination text not null default 'Tokyo, Japan',
  start_date  date,
  end_date    date,
  timezone    text not null default 'Asia/Tokyo',
  updated_at  timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);
insert into public.trip (id) values (1);

create table public.family_invite (
  id         smallint primary key default 1 check (id = 1),
  code       text not null check (char_length(code) between 6 and 40),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.generate_family_code()
returns text language sql volatile set search_path = '' as $$
  select upper(substr(h, 1, 5) || '-' || substr(h, 6, 5))
  from (select encode(extensions.gen_random_bytes(5), 'hex') as h) s;
$$;

-- A random code exists from day one; the owner reads it once via the SQL editor
-- (`select code from family_invite;`) and can rotate it in-app after becoming admin.
insert into public.family_invite (id, code) values (1, public.generate_family_code());

create or replace function public.normalize_code(c text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(c, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ============================================================================
-- Profiles (membership, role, pin color, preferences)
-- ============================================================================

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null check (char_length(display_name) between 1 and 40),
  avatar_path        text,
  role               text not null default 'member' check (role in ('admin', 'member')),
  -- UNIQUE makes simultaneous picks safe: the second writer gets a 23505 error.
  pin_color          text unique check (pin_color in (
                       'sakura', 'coral', 'tangerine', 'sunflower', 'matcha',
                       'teal', 'sky', 'indigo', 'violet', 'plum')),
  theme              text not null default 'system' check (theme in ('light', 'dark', 'system')),
  -- { "<notification kind>": boolean }; missing keys fall back to defaults.
  notification_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(notification_prefs) = 'object'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================================
-- Places
-- ============================================================================

create table public.places (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 120),
  category          text not null default 'other' check (category in (
                      'food', 'cafe', 'shopping', 'anime', 'attraction', 'museum',
                      'shrine', 'park', 'entertainment', 'nightlife', 'relaxation', 'other')),
  priority          smallint not null default 3 check (priority between 1 and 5),
  price_jpy         integer check (price_jpy >= 0),
  address           text check (char_length(address) <= 300),
  website           text check (char_length(website) <= 500),
  notes             text check (char_length(notes) <= 4000),
  status            text not null default 'awaiting'
                      check (status in ('awaiting', 'in_plan', 'rejected', 'visited')),
  lat               double precision check (lat between -90 and 90),
  lng               double precision check (lng between -180 and 180),
  geocode_status    text not null default 'pending'
                      check (geocode_status in ('pending', 'found', 'not_found', 'manual')),
  geocoded_address  text, -- the address string the current lat/lng came from
  added_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  status_changed_by uuid references public.profiles (id) on delete set null,
  status_changed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);

create index places_status_idx on public.places (status);

create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();

-- Server-side rules RLS can't express per-column:
--  * new places always start as 'awaiting' and belong to the caller
--  * only admins change status; added_by/created_at are immutable
-- auth.uid() is null for service-role/SQL-editor writes (seed, maintenance): trusted.
create or replace function public.places_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.added_by := auth.uid();
    new.status := 'awaiting';
    new.status_changed_by := null;
    new.status_changed_at := null;
    return new;
  end if;

  new.added_by := old.added_by;
  new.created_at := old.created_at;
  if new.status is distinct from old.status then
    if not public.is_admin() then
      raise exception 'Only the admin can change a place''s status' using errcode = '42501';
    end if;
    new.status_changed_by := auth.uid();
    new.status_changed_at := now();
  else
    new.status_changed_by := old.status_changed_by;
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end $$;

create trigger places_guard before insert or update on public.places
  for each row execute function public.places_guard();

-- ============================================================================
-- Votes (one per member per place; only while the place is awaiting a decision)
-- ============================================================================

create table public.votes (
  place_id   uuid not null references public.places (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  vote       text not null check (vote in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create trigger votes_updated_at before update on public.votes
  for each row execute function public.set_updated_at();

create or replace function public.place_is_open(p_place_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.places where id = p_place_id and status = 'awaiting');
$$;

-- ============================================================================
-- Itinerary (admin-owned) + suggestions (member-submitted)
-- ============================================================================

create table public.itinerary_items (
  id                 uuid primary key default gen_random_uuid(),
  place_id           uuid references public.places (id) on delete set null,
  title              text check (char_length(title) <= 120), -- free-form item, or override of place name
  day                date not null,
  slot               text not null default 'morning' check (slot in ('morning', 'afternoon', 'evening')),
  start_time         time,
  end_time           time,
  sort_order         double precision not null default 0,
  notes              text check (char_length(notes) <= 4000),
  reservation_status text not null default 'none' check (reservation_status in ('required', 'booked', 'none')),
  reservation_ref    text check (char_length(reservation_ref) <= 120),
  reservation_time   time,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (place_id is not null or title is not null)
);

create index itinerary_items_day_idx on public.itinerary_items (day, slot, sort_order);
create index itinerary_items_place_idx on public.itinerary_items (place_id);

create trigger itinerary_items_updated_at before update on public.itinerary_items
  for each row execute function public.set_updated_at();

-- Deleting a place keeps its itinerary entries: they become free-form items named after it.
-- security definer: the deleting member may not have write access to itinerary_items.
create or replace function public.places_preserve_itinerary()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.itinerary_items set title = coalesce(title, old.name) where place_id = old.id;
  return old;
end $$;

create trigger places_preserve_itinerary before delete on public.places
  for each row execute function public.places_preserve_itinerary();

create table public.itinerary_suggestions (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid references public.places (id) on delete cascade,
  item_id       uuid references public.itinerary_items (id) on delete cascade, -- set when suggesting a change to an existing item
  title         text check (char_length(title) <= 120),
  day           date not null,
  slot          text not null check (slot in ('morning', 'afternoon', 'evening')),
  start_time    time,
  note          text check (char_length(note) <= 2000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  suggested_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text check (char_length(review_note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (place_id is not null or item_id is not null or title is not null)
);

create index itinerary_suggestions_status_idx on public.itinerary_suggestions (status);

create trigger itinerary_suggestions_updated_at before update on public.itinerary_suggestions
  for each row execute function public.set_updated_at();

-- Members submit pending suggestions; only admins review them.
create or replace function public.suggestions_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.suggested_by := auth.uid();
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  new.suggested_by := old.suggested_by;
  new.created_at := old.created_at;
  if new.status is distinct from old.status
     or new.review_note is distinct from old.review_note then
    if not public.is_admin() then
      raise exception 'Only the admin can review suggestions' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;

create trigger suggestions_guard before insert or update on public.itinerary_suggestions
  for each row execute function public.suggestions_guard();

-- ============================================================================
-- Travel Info (admin-edited sections)
-- ============================================================================

create table public.travel_sections (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  icon       text,
  body       text not null default '' check (char_length(body) <= 20000),
  sort_order double precision not null default 0,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger travel_sections_updated_at before update on public.travel_sections
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Notifications (rows written by server-side triggers only)
-- ============================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'place_added', 'vote_cast', 'status_changed', 'itinerary_changed',
               'suggestion_submitted', 'suggestion_reviewed', 'reservation_upcoming')),
  title      text not null,
  body       text,
  link       text,
  actor_id   uuid references public.profiles (id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ============================================================================
-- Whiteboard (singleton scene; images live in the `whiteboard` storage bucket)
-- ============================================================================

create table public.whiteboard (
  id         smallint primary key default 1 check (id = 1),
  elements   jsonb not null default '[]'::jsonb,
  files      jsonb not null default '{}'::jsonb, -- { fileId: { path, mimeType } }
  version    bigint not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.whiteboard (id) values (1);

create or replace function public.whiteboard_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.version := old.version + 1;
  return new;
end $$;

create trigger whiteboard_touch before update on public.whiteboard
  for each row execute function public.whiteboard_touch();

-- ============================================================================
-- Geocode cache (shared, so the family never geocodes the same address twice)
-- ============================================================================

create table public.geocode_cache (
  query        text primary key, -- normalized address string
  found        boolean not null,
  lat          double precision,
  lng          double precision,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- RPCs
-- ============================================================================

-- Anonymous visitors may only learn whether a code is valid. Nothing else.
create or replace function public.check_family_code(code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_invite i
    where i.enabled and public.normalize_code(i.code) = public.normalize_code(check_family_code.code)
  );
$$;

-- Turn a freshly signed-up auth user into a family member.
-- The first member ever to join becomes the admin (the owner joins first).
create or replace function public.join_family(code text, display_name text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
  new_role text;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into result from public.profiles where id = uid;
  if found then
    return result;
  end if;

  if not public.check_family_code(code) then
    raise exception 'That family code is not valid' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('tabi.join_family'));
  new_role := case when exists (select 1 from public.profiles where role = 'admin')
                   then 'member' else 'admin' end;

  insert into public.profiles (id, display_name, role)
  values (uid, left(btrim(join_family.display_name), 40), new_role)
  returning * into result;
  return result;
end $$;

create or replace function public.rotate_family_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  new_code text := public.generate_family_code();
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  update public.family_invite set code = new_code, updated_at = now() where id = 1;
  return new_code;
end $$;

create or replace function public.set_member_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('tabi.roles'));
  if new_role = 'member'
     and (select count(*) from public.profiles where role = 'admin' and id <> target) = 0 then
    raise exception 'The family needs at least one admin' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

create or replace function public.remove_member(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'Admins cannot remove themselves' using errcode = '42501';
  end if;
  delete from public.profiles where id = target;
end $$;

-- ============================================================================
-- Privileges: deny by default, then grant what RLS should evaluate
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant execute on function public.check_family_code(text) to anon, authenticated;
grant execute on function
  public.join_family(text, text),
  public.rotate_family_code(),
  public.set_member_role(uuid, text),
  public.remove_member(uuid),
  public.is_member(),
  public.is_admin(),
  public.place_is_open(uuid)
to authenticated;

-- Column-level grants: members can't touch role/id even on their own row.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, avatar_path, pin_color, theme, notification_prefs)
  on public.profiles to authenticated;

revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke insert, delete on public.whiteboard from authenticated;
grant update (elements, files) on public.whiteboard to authenticated;

revoke insert, delete on public.trip from authenticated;
revoke delete on public.family_invite from authenticated;
revoke update, delete on public.geocode_cache from authenticated;

-- ============================================================================
-- Row-level security
-- ============================================================================

alter table public.trip                  enable row level security;
alter table public.family_invite         enable row level security;
alter table public.profiles              enable row level security;
alter table public.places                enable row level security;
alter table public.votes                 enable row level security;
alter table public.itinerary_items       enable row level security;
alter table public.itinerary_suggestions enable row level security;
alter table public.travel_sections       enable row level security;
alter table public.notifications         enable row level security;
alter table public.whiteboard            enable row level security;
alter table public.geocode_cache         enable row level security;

create policy "members read trip"   on public.trip for select to authenticated using ((select public.is_member()));
create policy "admin updates trip"  on public.trip for update to authenticated using ((select public.is_admin()));

create policy "admin reads code"    on public.family_invite for select to authenticated using ((select public.is_admin()));
create policy "admin updates code"  on public.family_invite for update to authenticated using ((select public.is_admin()));

create policy "members read profiles" on public.profiles for select to authenticated
  using ((select public.is_member()) or id = (select auth.uid()));
create policy "update own profile"    on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read places" on public.places for select to authenticated using ((select public.is_member()));
create policy "members add places"  on public.places for insert to authenticated
  with check ((select public.is_member()) and added_by = (select auth.uid()));
create policy "owner or admin edits place" on public.places for update to authenticated
  using (added_by = (select auth.uid()) or (select public.is_admin()))
  with check (added_by = (select auth.uid()) or (select public.is_admin()));
create policy "owner or admin deletes place" on public.places for delete to authenticated
  using (added_by = (select auth.uid()) or (select public.is_admin()));

create policy "members read votes" on public.votes for select to authenticated using ((select public.is_member()));
create policy "cast own vote" on public.votes for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()) and public.place_is_open(place_id));
create policy "change own vote" on public.votes for update to authenticated
  using (user_id = (select auth.uid()) and public.place_is_open(place_id))
  with check (user_id = (select auth.uid()) and public.place_is_open(place_id));
create policy "withdraw own vote" on public.votes for delete to authenticated
  using (user_id = (select auth.uid()) and public.place_is_open(place_id));

create policy "members read itinerary" on public.itinerary_items for select to authenticated using ((select public.is_member()));
create policy "admin writes itinerary" on public.itinerary_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "members read suggestions" on public.itinerary_suggestions for select to authenticated using ((select public.is_member()));
create policy "members suggest" on public.itinerary_suggestions for insert to authenticated
  with check ((select public.is_member()) and suggested_by = (select auth.uid()));
create policy "owner edits pending or admin reviews" on public.itinerary_suggestions for update to authenticated
  using ((suggested_by = (select auth.uid()) and status = 'pending') or (select public.is_admin()))
  with check ((suggested_by = (select auth.uid())) or (select public.is_admin()));
create policy "owner withdraws pending or admin deletes" on public.itinerary_suggestions for delete to authenticated
  using ((suggested_by = (select auth.uid()) and status = 'pending') or (select public.is_admin()));

create policy "members read travel info" on public.travel_sections for select to authenticated using ((select public.is_member()));
create policy "admin writes travel info" on public.travel_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "read own notifications"   on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications"   on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy "members read whiteboard"   on public.whiteboard for select to authenticated using ((select public.is_member()));
create policy "members update whiteboard" on public.whiteboard for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

create policy "members read geocode cache" on public.geocode_cache for select to authenticated using ((select public.is_member()));
create policy "members add geocode cache"  on public.geocode_cache for insert to authenticated with check ((select public.is_member()));

-- ============================================================================
-- Storage: public buckets with unguessable paths (see ARCHITECTURE.md).
-- Listing and writing require membership; avatars are per-user folders.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',    'avatars',    true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('whiteboard', 'whiteboard', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "members list tabi files" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'whiteboard') and (select public.is_member()));

create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (select public.is_member())
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "members upload whiteboard images" on storage.objects for insert to authenticated
  with check (bucket_id = 'whiteboard' and (select public.is_member()));
create policy "uploader or admin deletes whiteboard images" on storage.objects for delete to authenticated
  using (bucket_id = 'whiteboard' and (owner_id = (select auth.uid())::text or (select public.is_admin())));

-- ============================================================================
-- Realtime
-- ============================================================================

alter publication supabase_realtime add table
  public.trip, public.profiles, public.places, public.votes,
  public.itinerary_items, public.itinerary_suggestions, public.travel_sections,
  public.notifications, public.whiteboard;
