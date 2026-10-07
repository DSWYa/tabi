-- Phase 5 rules: notifications written by triggers (per recipient, respecting preferences), reservation
-- reminders, the notifications table's own permissions, unused-file cleanup and the family invite toggle.
-- Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- ---- fixtures --------------------------------------------------------------
delete from public.notifications;
delete from public.itinerary_suggestions;
delete from public.itinerary_items;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails;
update public.whiteboard set elements = '[]', files = '{}';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'member2@test.local');
update public.family_invite set code = 'TEST-CODE-6', enabled = true;
update public.trip set timezone = 'Asia/Tokyo';
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- Superuser with no signed-in user (like the service role / SQL editor), also used to peek into anyone's inbox.
create function pg_temp.system() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.inbox(uid uuid, k text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = uid and kind = k;
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.join_family('TEST-CODE-6', 'Admin');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.join_family('TEST-CODE-6', 'Member');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.join_family('TEST-CODE-6', 'Member Two');

-- ---- new places ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.places (id, name) values ('70000000-0000-0000-0000-000000000001', 'Shibuya Sky');
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'place_added'), 1::bigint, 'admin hears about a new place');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'place_added'), 1::bigint, 'other members hear about a new place');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000b', 'place_added'), 0::bigint, 'nobody is told about their own action');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'place_added'),
  'Member added Shibuya Sky', 'the title names who did what');
select is((select link from public.notifications where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'place_added'),
  '/voting?place=70000000-0000-0000-0000-000000000001', 'the link opens the place');
select is((select actor_id from public.notifications where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'place_added'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'the actor is recorded');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.profiles set notification_prefs = '{"place_added": false}' where id = auth.uid();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.places (id, name) values ('70000000-0000-0000-0000-000000000002', 'Ghibli Museum');
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'place_added'), 1::bigint, 'a member who switched a kind off gets no more of it');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'place_added'), 2::bigint, 'everyone else still does');

insert into public.places (id, name) values ('70000000-0000-0000-0000-000000000003', 'Seeded Place');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'place_added'), 2::bigint, 'writes without a signed-in member (seed, SQL editor) notify nobody');

-- ---- votes (off by default) ---------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into public.votes (place_id, vote) values ('70000000-0000-0000-0000-000000000001', 'yes');
select pg_temp.system();
select is((select count(*) from public.notifications where kind = 'vote_cast'), 0::bigint, '"Someone voted" is off unless switched on');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.profiles set notification_prefs = '{"vote_cast": true}' where id = auth.uid();
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.votes set vote = 'maybe' where place_id = '70000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000b', 'vote_cast'), 1::bigint, 'the place''s creator hears about votes once switched on');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'vote_cast'),
  'Member Two voted maybe on Shibuya Sky', 'the vote is named');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.votes set vote = 'no' where place_id = '70000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000b', 'vote_cast'), 1::bigint, 'changing a vote again refreshes the unread notification instead of adding one');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'vote_cast'),
  'Member Two voted no on Shibuya Sky', '…with the latest vote');

-- ---- status decisions -----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.places set status = 'in_plan' where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000b', 'status_changed'), 1::bigint, 'members hear about the admin''s decision');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b' and kind = 'status_changed'),
  'Shibuya Sky is in the plan', 'the decision is in the title');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'status_changed'), 0::bigint, 'the admin isn''t told about their own decision');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.places set notes = 'Book ahead' where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is((select count(*) from public.notifications where kind = 'status_changed'), 2::bigint, 'editing other fields is not a status change');

-- ---- itinerary -------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.itinerary_items (id, place_id, title, day, slot, start_time, sort_order) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', null, '2026-11-24', 'evening', '17:00', 0),
  ('80000000-0000-0000-0000-000000000002', null, 'Coffee', '2026-11-24', 'evening', null, 1);
select pg_temp.system();
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and link = '/itinerary?item=80000000-0000-0000-0000-000000000001'), 'Admin added Shibuya Sky to the itinerary', 'members hear about new entries');
select is((select body from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and link = '/itinerary?item=80000000-0000-0000-0000-000000000001'), 'Tue, Nov 24 · Evening, 17:00', 'with when it is');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'itinerary_changed'), 0::bigint, 'the admin isn''t told about their own edits');
update public.notifications set read_at = now() where kind = 'itinerary_changed';

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.move_itinerary_item('80000000-0000-0000-0000-000000000002', '2026-11-24', 'evening', 0);
select pg_temp.system();
select is((select count(*) from public.notifications where kind = 'itinerary_changed' and read_at is null), 0::bigint,
  'reordering inside a slot is not news');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.move_itinerary_item('80000000-0000-0000-0000-000000000001', '2026-11-25', 'morning', 0);
select pg_temp.system();
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and kind = 'itinerary_changed' and read_at is null), 'Admin moved Shibuya Sky', 'moving to another day is');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and kind = 'itinerary_changed' and read_at is null), 1::bigint, 'one notification per move, not one per renumbered entry');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.itinerary_items set reservation_status = 'booked', reservation_ref = 'SKY-1'
  where id = '80000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and kind = 'itinerary_changed' and read_at is null), 1::bigint, 'more edits to the same entry within minutes collapse into one');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000b'
  and kind = 'itinerary_changed' and read_at is null), 'Shibuya Sky is booked', 'showing the latest change');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
delete from public.itinerary_items where id = '80000000-0000-0000-0000-000000000002';
select pg_temp.system();
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000d'
  and title = 'Admin removed Coffee from the itinerary'), 1::bigint, 'members hear about removed entries');

update public.notifications set read_at = now() where kind = 'itinerary_changed';
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
delete from public.places where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is((select title from public.itinerary_items where id = '80000000-0000-0000-0000-000000000001'), 'Shibuya Sky',
  'a deleted place''s entry keeps its name');
select is((select count(*) from public.notifications where kind = 'itinerary_changed' and read_at is null), 0::bigint,
  '…without a confusing "updated" notification');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.itinerary_items set notes = 'Bring jackets' where id = '80000000-0000-0000-0000-000000000001';
select pg_temp.system();
select is((select count(*) from public.notifications where kind = 'itinerary_changed' and read_at is null), 2::bigint,
  'edits after the deletion notify again');

-- ---- suggestions -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.itinerary_suggestions (id, place_id, day, slot, start_time, note)
  values ('90000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '2026-11-26', 'morning', '10:00', 'Tickets sell out');
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000a', 'suggestion_submitted'), 1::bigint, 'admins hear about new suggestions');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'suggestion_submitted'), 0::bigint, 'members don''t');
select is((select title || ' | ' || body from public.notifications where kind = 'suggestion_submitted'),
  'Member suggested Ghibli Museum | Thu, Nov 26 · Morning, 10:00 — “Tickets sell out”', 'the suggestion is described');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.review_itinerary_suggestion('90000000-0000-0000-0000-000000000001', true, 'Great idea');
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000b', 'suggestion_reviewed'), 1::bigint, 'the author hears the verdict');
select is((select title || ' | ' || body from public.notifications where kind = 'suggestion_reviewed'),
  'Approved: Ghibli Museum | Admin: “Great idea”', 'with the admin''s note');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'suggestion_reviewed'), 0::bigint, 'nobody else gets the verdict');
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'status_changed'), 2::bigint,
  'approving a still-voting place also announces it joined the plan');

-- ---- reservation reminders -------------------------------------------------------------
insert into public.itinerary_items (id, title, day, slot, reservation_status, reservation_ref, reservation_time) values
  ('80000000-0000-0000-0000-000000000003', 'Sushi dinner', (now() at time zone 'Asia/Tokyo')::date + 1, 'evening', 'booked', 'SU-9', '19:00'),
  ('80000000-0000-0000-0000-000000000004', 'Robot show', (now() at time zone 'Asia/Tokyo')::date, 'evening', 'required', null, null),
  ('80000000-0000-0000-0000-000000000005', 'Far away', (now() at time zone 'Asia/Tokyo')::date + 5, 'evening', 'booked', null, null);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok('select public.send_reservation_reminders()', '42501', null, 'non-members cannot run the reminder sweep');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is(public.send_reservation_reminders(), 2, 'reservations today and tomorrow are announced');
select is(public.send_reservation_reminders(), 0, 'each only once');
select pg_temp.system();
select is(pg_temp.inbox('00000000-0000-0000-0000-00000000000d', 'reservation_upcoming'), 2::bigint, 'including to whoever ran the sweep');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000a'
  and link = '/itinerary?item=80000000-0000-0000-0000-000000000003'), 'Reservation tomorrow: Sushi dinner', 'booked reminder');
select is((select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000000a'
  and link = '/itinerary?item=80000000-0000-0000-0000-000000000004'), 'Still needs booking: Robot show', 'not-yet-booked reminder');

-- ---- the notifications table itself -------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.notifications where user_id <> auth.uid()), 0::bigint, 'members only see their own notifications');
select throws_ok($$insert into public.notifications (user_id, kind, title) values (auth.uid(), 'place_added', 'Fake')$$,
  '42501', null, 'members cannot write notifications');
select throws_ok($$select public.notify(array[auth.uid()], 'place_added', 'Fake', null, null, null)$$,
  '42501', null, 'members cannot call the internal notify()');
select throws_ok($$update public.notifications set title = 'Edited' where user_id = auth.uid()$$,
  '42501', null, 'members cannot rewrite a notification');
update public.notifications set read_at = now() where user_id = auth.uid();
select is((select count(*) from public.notifications where user_id = auth.uid() and read_at is null), 0::bigint, 'members mark their own as read');
delete from public.notifications where user_id = auth.uid();
select is((select count(*) from public.notifications where user_id = auth.uid()), 0::bigint, 'members clear their own');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.remove_member('00000000-0000-0000-0000-00000000000d');
insert into public.places (name) values ('After removal');
select pg_temp.system();
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000d'), 0::bigint,
  'removed members get nothing (and their old notifications are gone)');

-- ---- unused files ---------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner_id, created_at) values
  ('avatars', '00000000-0000-0000-0000-00000000000d/gone.webp', '00000000-0000-0000-0000-00000000000d', now() - interval '2 days'),
  ('avatars', '00000000-0000-0000-0000-00000000000b/current.webp', '00000000-0000-0000-0000-00000000000b', now() - interval '2 days'),
  ('avatars', '00000000-0000-0000-0000-00000000000b/old.webp', '00000000-0000-0000-0000-00000000000b', now() - interval '2 days'),
  ('avatars', '00000000-0000-0000-0000-00000000000b/fresh.webp', '00000000-0000-0000-0000-00000000000b', now()),
  ('whiteboard', 'a0000000-0000-0000-0000-000000000001.png', '00000000-0000-0000-0000-00000000000b', now() - interval '2 days'),
  ('whiteboard', 'a0000000-0000-0000-0000-000000000002.png', '00000000-0000-0000-0000-00000000000b', now() - interval '2 days'),
  ('whiteboard', 'a0000000-0000-0000-0000-000000000003.png', '00000000-0000-0000-0000-00000000000a', now() - interval '2 days');
update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000b/current.webp' where id = '00000000-0000-0000-0000-00000000000b';
update public.whiteboard set files = '{"f1": {"path": "a0000000-0000-0000-0000-000000000001.png", "mimeType": "image/png"}}';

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select results_eq($$select name from public.unused_storage_objects() order by name$$,
  array['00000000-0000-0000-0000-00000000000b/old.webp', '00000000-0000-0000-0000-00000000000d/gone.webp',
        'a0000000-0000-0000-0000-000000000002.png', 'a0000000-0000-0000-0000-000000000003.png'],
  'admin: unused avatars (incl. a removed member''s) and unreferenced board images, never fresh or in-use files');
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000d/gone.webp';
select is_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000d/gone.webp'$$,
  'admin deletes a removed member''s avatar');
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000b/current.webp';
select isnt_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000b/current.webp'$$,
  'admin cannot delete an avatar someone still uses');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select results_eq($$select name from public.unused_storage_objects() order by name$$,
  array['00000000-0000-0000-0000-00000000000b/old.webp', 'a0000000-0000-0000-0000-000000000002.png'],
  'members only get their own unused files');

-- ---- family invite toggle -------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.family_invite set enabled = false;
select ok(not public.check_family_code('TEST-CODE-6'), 'closing the family turns the code off');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.join_family('TEST-CODE-6', 'Outsider')$$, '42501', null, 'nobody can join a closed family');

select * from finish();
rollback;
