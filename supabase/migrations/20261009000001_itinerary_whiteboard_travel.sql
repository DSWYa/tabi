-- Phase 4: itinerary editing + ordering, suggestion review, Travel Info and the whiteboard.
-- Who-can-write for these tables is unchanged (see init migration: itinerary + travel info are admin-only,
-- suggestions are member-submitted, the whiteboard is shared). This adds data-shape rules, ordering RPCs,
-- the approve/reject RPC and members-only realtime broadcast for the whiteboard.

-- ============================================================================
-- Itinerary items
-- ============================================================================

alter table public.itinerary_items
  add constraint itinerary_items_title_not_blank check (title is null or btrim(title) <> ''),
  add constraint itinerary_items_reservation_ref_not_blank check (reservation_ref is null or btrim(reservation_ref) <> ''),
  -- A booking reference / time only means something when a reservation is needed or made.
  add constraint itinerary_items_reservation_details
    check (reservation_status <> 'none' or (reservation_ref is null and reservation_time is null));

-- created_by is always the writer and never changes (service-role/SQL-editor writes are trusted).
create or replace function public.itinerary_items_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger itinerary_items_guard before insert or update on public.itinerary_items
  for each row execute function public.itinerary_items_guard();

-- Where a new entry goes inside its day + slot: before the first entry that starts later, else at the end.
-- Mirrors `sortOrderFor` in src/lib/itinerary.ts (the app uses it for optimistic updates).
create or replace function public.itinerary_sort_order_for(p_day date, p_slot text, p_start time, p_exclude uuid default null)
returns double precision language plpgsql stable set search_path = '' as $$
declare
  nxt double precision;
  prv double precision;
begin
  if p_start is not null then
    select min(sort_order) into nxt from public.itinerary_items
      where day = p_day and slot = p_slot and start_time > p_start and id is distinct from p_exclude;
  end if;
  if nxt is null then
    select max(sort_order) into prv from public.itinerary_items
      where day = p_day and slot = p_slot and id is distinct from p_exclude;
    return coalesce(prv + 1, 0);
  end if;
  select max(sort_order) into prv from public.itinerary_items
    where day = p_day and slot = p_slot and sort_order < nxt and id is distinct from p_exclude;
  return case when prv is null then nxt - 1 else (prv + nxt) / 2 end;
end $$;

-- Drag/drop and "move up/down": put an entry at `to_index` inside a day + slot and renumber that group 0..n,
-- so the order never runs out of room between two neighbours. Security invoker: RLS still applies.
create or replace function public.move_itinerary_item(item_id uuid, to_day date, to_slot text, to_index int)
returns void language plpgsql set search_path = '' as $$
declare
  ids uuid[];
  pos int;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can rearrange the itinerary' using errcode = '42501';
  end if;
  if to_slot not in ('morning', 'afternoon', 'evening') then
    raise exception 'Unknown part of the day' using errcode = '22023';
  end if;
  -- Two admins dragging at once must not interleave their renumbering.
  perform pg_advisory_xact_lock(hashtext('tabi.itinerary_order'));
  if not exists (select 1 from public.itinerary_items where id = move_itinerary_item.item_id) then
    raise exception 'That itinerary entry no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(i.id order by i.sort_order, i.id), '{}') into ids
    from public.itinerary_items i
    where i.day = to_day and i.slot = to_slot and i.id <> move_itinerary_item.item_id;
  pos := greatest(0, least(coalesce(to_index, cardinality(ids)), cardinality(ids)));
  ids := ids[1:pos] || move_itinerary_item.item_id || ids[pos + 1:];

  update public.itinerary_items i
    set day = to_day, slot = to_slot, sort_order = o.ord - 1
    from unnest(ids) with ordinality as o (id, ord)
    where i.id = o.id
      and (i.day, i.slot, i.sort_order) is distinct from (to_day, to_slot, (o.ord - 1)::double precision);
end $$;

-- ============================================================================
-- Itinerary suggestions
-- ============================================================================

alter table public.itinerary_suggestions
  add constraint itinerary_suggestions_title_not_blank check (title is null or btrim(title) <> ''),
  -- A suggestion either proposes a new entry (place or free-form title) or moves an existing one.
  add constraint itinerary_suggestions_one_kind check (item_id is null or (place_id is null and title is null));

-- Approve (applies the suggestion to the itinerary) or reject, in one transaction. Admin only.
-- Approving a new entry for a place that is still awaiting a vote (or was rejected) adds it to the plan too:
-- scheduling it is the admin's decision. Returns the itinerary entry created or moved (null when rejected).
create or replace function public.review_itinerary_suggestion(suggestion_id uuid, approve boolean, review_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.itinerary_suggestions;
  target public.itinerary_items;
  result uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can review suggestions' using errcode = '42501';
  end if;
  select * into s from public.itinerary_suggestions where id = review_itinerary_suggestion.suggestion_id for update;
  if not found then
    raise exception 'That suggestion no longer exists' using errcode = 'P0002';
  end if;
  if s.status <> 'pending' then
    raise exception 'That suggestion was already reviewed' using errcode = '55000';
  end if;

  if approve then
    perform pg_advisory_xact_lock(hashtext('tabi.itinerary_order'));
    if s.item_id is not null then
      select * into target from public.itinerary_items where id = s.item_id for update;
      update public.itinerary_items set
        day = s.day,
        slot = s.slot,
        start_time = s.start_time,
        end_time = case when s.start_time is not distinct from target.start_time then target.end_time end,
        sort_order = case
          when (target.day, target.slot) = (s.day, s.slot) and s.start_time is not distinct from target.start_time
            then target.sort_order
          else public.itinerary_sort_order_for(s.day, s.slot, s.start_time, target.id) end
      where id = target.id;
      result := target.id;
    else
      insert into public.itinerary_items (place_id, title, day, slot, start_time, sort_order)
      values (s.place_id, s.title, s.day, s.slot, s.start_time,
              public.itinerary_sort_order_for(s.day, s.slot, s.start_time))
      returning id into result;
      update public.places set status = 'in_plan'
        where id = s.place_id and status in ('awaiting', 'rejected');
    end if;
  end if;

  update public.itinerary_suggestions
    set status = case when approve then 'approved' else 'rejected' end,
        review_note = nullif(btrim(review_itinerary_suggestion.review_note), '')
    where id = s.id;
  return result;
end $$;

-- ============================================================================
-- Travel Info
-- ============================================================================

alter table public.travel_sections
  add constraint travel_sections_title_not_blank check (btrim(title) <> ''),
  -- Mirrors TRAVEL_ICONS in src/lib/constants.ts.
  add constraint travel_sections_icon_known check (icon is null or icon in (
    'plane', 'hotel', 'train', 'receipt', 'siren', 'info', 'phone', 'wallet', 'map', 'utensils',
    'heart-pulse', 'luggage', 'wifi', 'calendar', 'shopping-bag', 'sparkles'));

-- updated_by is always the last writer.
create or replace function public.travel_sections_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger travel_sections_touch before insert or update on public.travel_sections
  for each row execute function public.travel_sections_touch();

-- Same renumbering approach as the itinerary: move one section to `to_index`, then number them 0..n.
create or replace function public.move_travel_section(section_id uuid, to_index int)
returns void language plpgsql set search_path = '' as $$
declare
  ids uuid[];
  pos int;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can rearrange Travel Info' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('tabi.travel_order'));
  if not exists (select 1 from public.travel_sections where id = move_travel_section.section_id) then
    raise exception 'That section no longer exists' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(t.id order by t.sort_order, t.created_at, t.id), '{}') into ids
    from public.travel_sections t where t.id <> move_travel_section.section_id;
  pos := greatest(0, least(coalesce(to_index, cardinality(ids)), cardinality(ids)));
  ids := ids[1:pos] || move_travel_section.section_id || ids[pos + 1:];

  update public.travel_sections t set sort_order = o.ord - 1
    from unnest(ids) with ordinality as o (id, ord)
    where t.id = o.id and t.sort_order is distinct from (o.ord - 1)::double precision;
end $$;

-- ============================================================================
-- Whiteboard
-- ============================================================================

-- files is { "<excalidraw file id>": { "path": "<uuid>.<ext>", "mimeType": "image/…" } } — nothing else.
create or replace function public.whiteboard_files_valid(files jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(files) <> 'object' then false else (
    select coalesce(bool_and(
      char_length(e.key) between 1 and 100
      and jsonb_typeof(e.value) = 'object'
      and coalesce(e.value ->> 'path', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'
      and coalesce(e.value ->> 'mimeType', '') in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
    ), true)
    from jsonb_each(files) as e
  ) end;
$$;

alter table public.whiteboard
  add constraint whiteboard_elements_array check (jsonb_typeof(elements) = 'array'),
  add constraint whiteboard_files_shape check (public.whiteboard_files_valid(files)),
  -- Generous cap (a busy board is well under 1 MB); stops one bad client from bloating the row.
  add constraint whiteboard_elements_size check (octet_length(elements::text) <= 8000000);

-- The init migration granted update (elements, files) but never revoked the table-wide UPDATE Supabase grants
-- by default, so the column grant did nothing. (whiteboard_touch already overwrote version/updated_by.)
revoke update on public.whiteboard from authenticated;
grant update (elements, files) on public.whiteboard to authenticated;

-- Images: no SVG (it can carry scripts), and object names must be `<uuid>.<ext>` like the files map.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  where id = 'whiteboard';

drop policy "members upload whiteboard images" on storage.objects;
create policy "members upload whiteboard images" on storage.objects for insert to authenticated
  with check (bucket_id = 'whiteboard' and (select public.is_member())
              and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$');

-- Live strokes and cursors travel over a *private* Realtime broadcast channel. Only members may join it
-- or send on it; without these policies anyone holding the public key could listen in.
create policy "members receive whiteboard broadcasts" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'whiteboard' and extension = 'broadcast' and (select public.is_member()));
create policy "members send whiteboard broadcasts" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'whiteboard' and extension = 'broadcast' and (select public.is_member()));

-- ============================================================================
-- Privileges
-- ============================================================================

grant execute on function
  public.move_itinerary_item(uuid, date, text, int),
  public.review_itinerary_suggestion(uuid, boolean, text),
  public.move_travel_section(uuid, int),
  public.whiteboard_files_valid(jsonb)
to authenticated;
