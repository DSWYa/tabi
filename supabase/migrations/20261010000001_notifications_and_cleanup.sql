-- Phase 5: notifications written by triggers (one row per recipient, respecting profiles.notification_prefs),
-- reservation reminders, unused-file cleanup rules for Storage, and live updates for the family invite.
-- Who-can-write for existing tables is unchanged.

-- ============================================================================
-- Preferences
-- ============================================================================

-- Defaults for kinds a member never toggled. Mirrors NOTIFICATION_KINDS in src/lib/constants.ts (a unit test checks).
create or replace function public.notification_defaults()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"place_added": true, "vote_cast": false, "status_changed": true, "itinerary_changed": true, "suggestion_submitted": true, "suggestion_reviewed": true, "reservation_upcoming": true}'::jsonb;
$$;

-- Null when `uid` is not a member (removed members get nothing).
create or replace function public.wants_notification(uid uuid, kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((p.notification_prefs ->> kind)::boolean, (public.notification_defaults() ->> kind)::boolean, true)
  from public.profiles p where p.id = uid;
$$;

create or replace function public.member_name(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.profiles where id = uid), 'Someone');
$$;

create or replace function public.member_ids(admins_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from public.profiles where not admins_only or role = 'admin';
$$;

-- "Tue, Nov 24 · Evening, 17:00"
create or replace function public.format_when(p_day date, p_slot text, p_time time default null)
returns text language sql immutable set search_path = '' as $$
  select to_char(p_day, 'Dy, Mon FMDD') || ' · ' || initcap(p_slot)
         || coalesce(', ' || to_char(p_time, 'HH24:MI'), '');
$$;

-- ============================================================================
-- Delivery
-- ============================================================================

-- Writes one notification per recipient who wants this kind, never to the actor themselves. Bursts collapse:
-- if the same actor already left this recipient an unread notification of the same kind about the same thing
-- (same link) in the last 10 minutes, that one is refreshed instead of adding another.
create or replace function public.notify(
  p_recipients uuid[], p_kind text, p_title text, p_body text, p_link text, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r uuid;
begin
  for r in select distinct x from unnest(p_recipients) as x where x is not null loop
    continue when r is not distinct from p_actor;
    continue when not coalesce(public.wants_notification(r, p_kind), false);
    update public.notifications n
      set title = left(p_title, 200), body = left(p_body, 500), created_at = now()
      where n.user_id = r and n.kind = p_kind and n.link is not distinct from p_link
        and n.actor_id is not distinct from p_actor and n.read_at is null
        and n.created_at > now() - interval '10 minutes';
    if not found then
      insert into public.notifications (user_id, kind, title, body, link, actor_id)
      values (r, p_kind, left(p_title, 200), left(p_body, 500), p_link, p_actor);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Triggers. They only fire for member actions (auth.uid() set); seed scripts and SQL-editor fixes stay quiet.
-- All are security definer: they read other members' preferences and insert rows members can't insert.
-- ============================================================================

-- ---- places: new place, status decided ---------------------------------------
create or replace function public.places_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  who text := public.member_name(auth.uid());
begin
  if actor is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.notify(public.member_ids(), 'place_added', who || ' added ' || new.name,
      'Have a look and cast your vote.', '/voting?place=' || new.id, actor);
  elsif new.status is distinct from old.status then
    perform public.notify(public.member_ids(), 'status_changed',
      new.name || case new.status
        when 'in_plan' then ' is in the plan'
        when 'rejected' then ' didn''t make the cut'
        when 'visited' then ' was marked visited'
        else ' is back up for a vote' end,
      'Decided by ' || who || '.', '/places?place=' || new.id, actor);
  end if;
  return null;
end $$;

create trigger places_notify after insert or update of status on public.places
  for each row execute function public.places_notify();

-- ---- votes: tell the place's creator and the admins ----------------------------
create or replace function public.votes_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  p public.places;
begin
  if actor is null or (tg_op = 'UPDATE' and new.vote is not distinct from old.vote) then
    return null;
  end if;
  select * into p from public.places where id = new.place_id;
  if not found then
    return null;
  end if;
  perform public.notify(public.member_ids(true) || p.added_by, 'vote_cast',
    public.member_name(actor) || ' voted ' || case new.vote when 'yes' then 'yes' when 'maybe' then 'maybe' else 'no' end
      || ' on ' || p.name,
    null, '/voting?place=' || p.id, actor);
  return null;
end $$;

create trigger votes_notify after insert or update of vote on public.votes
  for each row execute function public.votes_notify();

-- ---- itinerary: added / moved / changed / removed ----------------------------------
-- Pure reordering (sort_order only, e.g. drag and drop inside a slot) is not news. Neither is the bookkeeping when
-- a place is deleted (its entries keep its name and become free-form; see places_preserve_itinerary).
-- Plain arguments (not a row): PostgREST would expose a function taking a table row as a computed column.
create or replace function public.itinerary_item_name(p_title text, p_place_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(p_title, (select name from public.places where id = p_place_id), 'An itinerary entry');
$$;

create or replace function public.itinerary_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  who text := public.member_name(auth.uid());
  name text;
  moved boolean;
begin
  if actor is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.notify(public.member_ids(), 'itinerary_changed',
      who || ' added ' || public.itinerary_item_name(new.title, new.place_id) || ' to the itinerary',
      public.format_when(new.day, new.slot, new.start_time), '/itinerary?item=' || new.id, actor);
  elsif tg_op = 'DELETE' then
    perform public.notify(public.member_ids(), 'itinerary_changed',
      who || ' removed ' || public.itinerary_item_name(old.title, old.place_id) || ' from the itinerary',
      'It was on ' || public.format_when(old.day, old.slot, old.start_time) || '.', '/itinerary', actor);
  else
    if old.place_id is not null
       and strpos(coalesce(current_setting('tabi.deleted_places', true), ''), old.place_id::text) > 0 then
      return null;
    end if;
    if (new.day, new.slot, new.start_time, new.end_time, new.place_id, new.title, new.notes,
        new.reservation_status, new.reservation_ref, new.reservation_time)
       is not distinct from
       (old.day, old.slot, old.start_time, old.end_time, old.place_id, old.title, old.notes,
        old.reservation_status, old.reservation_ref, old.reservation_time) then
      return null;
    end if;
    name := public.itinerary_item_name(new.title, new.place_id);
    moved := (new.day, new.slot, new.start_time) is distinct from (old.day, old.slot, old.start_time);
    perform public.notify(public.member_ids(), 'itinerary_changed',
      case
        when moved then who || ' moved ' || name
        when new.reservation_status = 'booked' and old.reservation_status <> 'booked' then name || ' is booked'
        else who || ' updated ' || name end,
      case when moved then 'Now ' || public.format_when(new.day, new.slot, new.start_time) || '.'
           else public.format_when(new.day, new.slot, new.start_time) end,
      '/itinerary?item=' || new.id, actor);
  end if;
  return null;
end $$;

create trigger itinerary_notify after insert or update or delete on public.itinerary_items
  for each row execute function public.itinerary_notify();

-- Deleting a place rewrites its itinerary entries (title kept, then the FK unlinks the place). Keep that quiet: the
-- deleted place's id is remembered for the rest of the transaction (the one API request that deleted it), and
-- itinerary_notify ignores updates to entries that pointed at it.
create or replace function public.places_preserve_itinerary()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('tabi.deleted_places',
    coalesce(nullif(current_setting('tabi.deleted_places', true), ''), '') || old.id::text || ',', true);
  update public.itinerary_items set title = coalesce(title, old.name) where place_id = old.id;
  return old;
end $$;

-- ---- suggestions: submitted (to admins), reviewed (to the author) --------------------
create or replace function public.suggestion_name(p_title text, p_place_id uuid, p_item_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    p_title,
    (select name from public.places where id = p_place_id),
    (select public.itinerary_item_name(i.title, i.place_id) from public.itinerary_items i where i.id = p_item_id),
    'an itinerary entry');
$$;

create or replace function public.suggestions_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  who text := public.member_name(auth.uid());
  name text := public.suggestion_name(new.title, new.place_id, new.item_id);
begin
  if actor is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.notify(public.member_ids(true), 'suggestion_submitted',
      who || case when new.item_id is null then ' suggested ' || name else ' suggested moving ' || name end,
      public.format_when(new.day, new.slot, new.start_time) || coalesce(' — “' || left(new.note, 140) || '”', ''),
      '/itinerary', actor);
  elsif old.status = 'pending' and new.status <> 'pending' then
    perform public.notify(array[new.suggested_by], 'suggestion_reviewed',
      case when new.status = 'approved' then 'Approved: ' || name else 'Not this time: ' || name end,
      coalesce(who || ': “' || left(new.review_note, 200) || '”', 'Reviewed by ' || who || '.'),
      '/itinerary', actor);
  end if;
  return null;
end $$;

create trigger suggestions_notify after insert or update of status on public.itinerary_suggestions
  for each row execute function public.suggestions_notify();

-- ============================================================================
-- Reservation reminders. No scheduler needed: every member's app calls send_reservation_reminders() now and then
-- (at most hourly); each entry with a reservation is announced once per day it's on, the day before or the day of
-- (trip time zone). Rows here only record what was sent.
-- ============================================================================

create table public.reservation_reminders (
  item_id uuid not null references public.itinerary_items (id) on delete cascade,
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (item_id, day)
);
alter table public.reservation_reminders enable row level security;
revoke all on public.reservation_reminders from anon, authenticated;

create or replace function public.send_reservation_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date;
  item record;
  sent integer := 0;
begin
  if not public.is_member() then
    raise exception 'Members only' using errcode = '42501';
  end if;
  select (now() at time zone t.timezone)::date into today from public.trip t where t.id = 1;

  for item in
    select i.*, public.itinerary_item_name(i.title, i.place_id) as name
    from public.itinerary_items i
    where i.reservation_status in ('required', 'booked') and i.day between today and today + 1
    order by i.day, i.sort_order
  loop
    insert into public.reservation_reminders (item_id, day) values (item.id, item.day) on conflict do nothing;
    continue when not found;
    sent := sent + 1;
    perform public.notify(public.member_ids(), 'reservation_upcoming',
      case when item.reservation_status = 'booked'
        then 'Reservation ' || case when item.day = today then 'today' else 'tomorrow' end || ': ' || item.name
        else 'Still needs booking: ' || item.name end,
      public.format_when(item.day, item.slot, coalesce(item.reservation_time, item.start_time))
        || coalesce(' · ref ' || item.reservation_ref, ''),
      '/itinerary?item=' || item.id, null);
  end loop;
  return sent;
end $$;

-- ============================================================================
-- Unused files in Storage. SQL can't delete objects (Supabase's protect_delete trigger), so the app asks
-- unused_storage_objects() what is safe to delete and removes it through the Storage API; RLS re-checks each one.
-- ============================================================================

-- Admins may delete avatars nobody uses any more (a removed member's photo, an upload whose profile update
-- failed). The age check keeps a fresh upload safe while its profile update is still on the way.
create policy "admin deletes unused avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (select public.is_admin())
         and created_at < now() - interval '1 hour'
         and not exists (select 1 from public.profiles p where p.avatar_path = storage.objects.name));

-- What the caller may delete: avatars no profile points at (admins: anyone's; members: their own folder) and
-- whiteboard images the saved board no longer references (admins: all; members: their own uploads).
-- Whiteboard images get a day's grace: deleted images stay restorable (undo) until their tombstones are pruned.
create or replace function public.unused_storage_objects()
returns table (bucket_id text, name text) language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name
  from storage.objects o
  where public.is_member()
    and (
      (o.bucket_id = 'avatars'
        and o.created_at < now() - interval '1 hour'
        and not exists (select 1 from public.profiles p where p.avatar_path = o.name)
        and (public.is_admin() or (storage.foldername(o.name))[1] = auth.uid()::text))
      or
      (o.bucket_id = 'whiteboard'
        and o.created_at < now() - interval '1 day'
        and not exists (
          select 1 from public.whiteboard w, jsonb_each(w.files) f where f.value ->> 'path' = o.name)
        and (public.is_admin() or o.owner_id = auth.uid()::text))
    )
  order by o.bucket_id, o.name
  limit 500;
$$;

-- ============================================================================
-- Family invite: keep updated_at honest and let a second admin's screen follow an open/close toggle live.
-- ============================================================================

create trigger family_invite_updated_at before update on public.family_invite
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.family_invite;

-- ============================================================================
-- Privileges: helpers are internal; members call only the reminder sweep and the cleanup query.
-- ============================================================================

revoke execute on function
  public.notification_defaults(),
  public.wants_notification(uuid, text),
  public.member_name(uuid),
  public.member_ids(boolean),
  public.format_when(date, text, time),
  public.notify(uuid[], text, text, text, text, uuid),
  public.itinerary_item_name(text, uuid),
  public.suggestion_name(text, uuid, uuid),
  public.places_notify(),
  public.votes_notify(),
  public.itinerary_notify(),
  public.suggestions_notify()
from public, anon, authenticated;

grant execute on function
  public.send_reservation_reminders(),
  public.unused_storage_objects()
to authenticated;
