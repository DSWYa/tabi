-- Phase 4 rules: itinerary shape + ordering, suggestion review, Travel Info, the whiteboard row,
-- whiteboard images and the members-only whiteboard broadcast channel. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- ---- fixtures --------------------------------------------------------------
delete from public.itinerary_suggestions;
delete from public.itinerary_items;
delete from public.travel_sections;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails;
update public.whiteboard set elements = '[]', files = '{}';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'member2@test.local');
update public.family_invite set code = 'TEST-CODE-5', enabled = true;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.join_family('TEST-CODE-5', 'Admin');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.join_family('TEST-CODE-5', 'Member');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.join_family('TEST-CODE-5', 'Member Two');

reset role;
insert into public.places (id, name, status, added_by) values
  ('50000000-0000-0000-0000-000000000001', 'Shibuya Sky', 'awaiting', '00000000-0000-0000-0000-00000000000b'),
  ('50000000-0000-0000-0000-000000000002', 'Meiji Jingu', 'in_plan', '00000000-0000-0000-0000-00000000000b');

-- ---- itinerary data shape --------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into public.itinerary_items (id, place_id, title, day, slot, start_time, sort_order) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', null, '2026-11-22', 'morning', '09:00', 0),
  ('60000000-0000-0000-0000-000000000002', null, 'Coffee', '2026-11-22', 'morning', null, 1),
  ('60000000-0000-0000-0000-000000000003', null, 'Walk', '2026-11-22', 'morning', null, 2),
  ('60000000-0000-0000-0000-000000000004', null, 'Lunch', '2026-11-22', 'afternoon', '12:00', 0)$$,
  'admin adds itinerary entries');
select throws_ok($$insert into public.itinerary_items (title, day) values ('   ', '2026-11-22')$$,
  '23514', null, 'an entry title cannot be blank');
select throws_ok($$insert into public.itinerary_items (title, day, reservation_status, reservation_ref) values ('Dinner', '2026-11-22', 'none', 'ABC')$$,
  '23514', null, 'a booking reference needs a reservation');
select throws_ok($$insert into public.itinerary_items (title, day, reservation_status, reservation_time) values ('Dinner', '2026-11-22', 'none', '19:00')$$,
  '23514', null, 'a reservation time needs a reservation');
select throws_ok($$insert into public.itinerary_items (title, day, reservation_status, reservation_ref) values ('Dinner', '2026-11-22', 'booked', ' ')$$,
  '23514', null, 'a booking reference cannot be blank');
select lives_ok($$insert into public.itinerary_items (id, title, day, slot, reservation_status, reservation_ref, reservation_time, created_by)
  values ('60000000-0000-0000-0000-000000000005', 'Dinner', '2026-11-22', 'evening', 'booked', 'TLP-1', '19:00', '00000000-0000-0000-0000-00000000000b')$$,
  'admin adds a booked reservation');
select is((select created_by from public.itinerary_items where id = '60000000-0000-0000-0000-000000000005'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'created_by is always the writer');
update public.itinerary_items set created_by = '00000000-0000-0000-0000-00000000000d' where id = '60000000-0000-0000-0000-000000000005';
select is((select created_by from public.itinerary_items where id = '60000000-0000-0000-0000-000000000005'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'created_by cannot be changed');

-- ---- moving entries ----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.move_itinerary_item('60000000-0000-0000-0000-000000000003', '2026-11-22', 'morning', 0)$$,
  '42501', null, 'a member cannot rearrange the itinerary');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.move_itinerary_item('60000000-0000-0000-0000-000000000003', '2026-11-22', 'morning', 0);
select results_eq($$select title, sort_order from public.itinerary_items where day = '2026-11-22' and slot = 'morning' order by sort_order$$,
  $$values ('Walk'::text, 0::double precision), (null, 1), ('Coffee', 2)$$,
  'moving within a slot renumbers it 0..n');
select public.move_itinerary_item('60000000-0000-0000-0000-000000000001', '2026-11-22', 'afternoon', 1);
select results_eq($$select id, slot, sort_order from public.itinerary_items where day = '2026-11-22' and slot = 'afternoon' order by sort_order$$,
  $$values ('60000000-0000-0000-0000-000000000004'::uuid, 'afternoon'::text, 0::double precision),
           ('60000000-0000-0000-0000-000000000001', 'afternoon', 1)$$,
  'moving into another slot puts it at the requested position');
select public.move_itinerary_item('60000000-0000-0000-0000-000000000002', '2026-11-23', 'evening', 99);
select results_eq($$select day, slot, sort_order from public.itinerary_items where id = '60000000-0000-0000-0000-000000000002'$$,
  $$values ('2026-11-23'::date, 'evening'::text, 0::double precision)$$,
  'an out-of-range index is clamped (here: into an empty slot on another day)');
select throws_ok($$select public.move_itinerary_item('6fffffff-0000-0000-0000-000000000000', '2026-11-22', 'morning', 0)$$,
  'P0002', null, 'moving a deleted entry reports it is gone');
select throws_ok($$select public.move_itinerary_item('60000000-0000-0000-0000-000000000003', '2026-11-22', 'brunch', 0)$$,
  '22023', null, 'unknown parts of the day are rejected');

-- ---- suggestions: shape -------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$insert into public.itinerary_suggestions (item_id, title, day, slot)
  values ('60000000-0000-0000-0000-000000000003', 'Also rename it', '2026-11-24', 'morning')$$,
  '23514', null, 'a move suggestion cannot also propose a new stop');
select throws_ok($$insert into public.itinerary_suggestions (title, day, slot) values (' ', '2026-11-24', 'morning')$$,
  '23514', null, 'a suggested title cannot be blank');
select lives_ok($$insert into public.itinerary_suggestions (id, place_id, day, slot, start_time, note)
  values ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '2026-11-22', 'morning', '10:00', 'Sunset!')$$,
  'member suggests a place still being voted on');
select lives_ok($$insert into public.itinerary_suggestions (id, item_id, day, slot, start_time)
  values ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '2026-11-25', 'evening', '19:00')$$,
  'member suggests moving an existing entry');
select throws_ok($$select public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000001', true)$$,
  '42501', null, 'a member cannot approve suggestions');
select throws_ok($$select public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000003', false, 'nah')$$,
  '42501', null, 'a member cannot reject suggestions');

-- ---- suggestions: approve a new stop -----------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select isnt(public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000001', true, '  Booked the slot  '), null,
  'admin approves a new stop and gets its itinerary entry back');
select results_eq($$select day, slot, start_time, sort_order, created_by from public.itinerary_items
  where place_id = '50000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-11-22'::date, 'morning'::text, '10:00'::time, 1::double precision, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'the approved stop goes last in its slot (nothing starts later) and belongs to the admin');
select results_eq($$select status, status_changed_by from public.places where id = '50000000-0000-0000-0000-000000000001'$$,
  $$values ('in_plan'::text, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'scheduling a place that was awaiting a vote adds it to the plan');
select results_eq($$select status, reviewed_by, reviewed_at is not null, review_note from public.itinerary_suggestions
  where id = '70000000-0000-0000-0000-000000000001'$$,
  $$values ('approved'::text, '00000000-0000-0000-0000-00000000000a'::uuid, true, 'Booked the slot'::text)$$,
  'the suggestion is marked approved with who, when and the trimmed reply');
select throws_ok($$select public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000001', true)$$,
  '55000', null, 'a suggestion cannot be reviewed twice');
select is((select count(*)::int from public.itinerary_items where place_id = '50000000-0000-0000-0000-000000000001'), 1,
  'the failed second review created nothing');

-- ---- suggestions: approve a move, time-aware placement, reject ------------------
select public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000003', true);
select results_eq($$select day, slot, start_time from public.itinerary_items where id = '60000000-0000-0000-0000-000000000003'$$,
  $$values ('2026-11-25'::date, 'evening'::text, '19:00'::time)$$,
  'approving a move moves the entry');

insert into public.itinerary_items (id, title, day, slot, start_time, sort_order) values
  ('60000000-0000-0000-0000-000000000011', 'Early', '2026-11-26', 'afternoon', '12:00', 0),
  ('60000000-0000-0000-0000-000000000012', 'Late', '2026-11-26', 'afternoon', '15:00', 1);
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into public.itinerary_suggestions (id, title, day, slot, start_time) values
  ('70000000-0000-0000-0000-000000000004', 'Arcade', '2026-11-26', 'afternoon', '13:00'),
  ('70000000-0000-0000-0000-000000000005', 'Karaoke', '2026-11-26', 'evening', null);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000004', true);
select is((select sort_order from public.itinerary_items where title = 'Arcade'), 0.5::double precision,
  'an approved stop with a time goes between the entries around it');
select is(public.review_itinerary_suggestion('70000000-0000-0000-0000-000000000005', false, 'Not this time'), null,
  'rejecting returns no entry');
select results_eq($$select status, review_note, reviewed_by from public.itinerary_suggestions where id = '70000000-0000-0000-0000-000000000005'$$,
  $$values ('rejected'::text, 'Not this time'::text, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'a rejection is recorded with the reply');
select is_empty($$select 1 from public.itinerary_items where title = 'Karaoke'$$, 'rejecting adds nothing to the itinerary');
select throws_ok($$select public.review_itinerary_suggestion('7fffffff-0000-0000-0000-000000000000', true)$$,
  'P0002', null, 'reviewing a withdrawn suggestion reports it is gone');

-- ---- Travel Info -------------------------------------------------------------
select lives_ok($$insert into public.travel_sections (id, title, icon, sort_order) values
  ('80000000-0000-0000-0000-000000000001', 'Flights', 'plane', 0),
  ('80000000-0000-0000-0000-000000000002', 'Hotel', 'hotel', 1),
  ('80000000-0000-0000-0000-000000000003', 'Emergency', 'siren', 2)$$, 'admin creates sections');
select throws_ok($$insert into public.travel_sections (title) values ('  ')$$, '23514', null, 'a section title cannot be blank');
select throws_ok($$insert into public.travel_sections (title, icon) values ('Rockets', 'rocket')$$, '23514', null, 'only known icons are allowed');
select is((select updated_by from public.travel_sections where id = '80000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'the writer is recorded as updated_by');
select lives_ok($$update public.travel_sections set title = 'Flights ✈' where id = '80000000-0000-0000-0000-000000000001'$$,
  'admin renames a section');
select public.move_travel_section('80000000-0000-0000-0000-000000000003', 0);
select results_eq($$select title, sort_order from public.travel_sections order by sort_order$$,
  $$values ('Emergency'::text, 0::double precision), ('Flights ✈', 1), ('Hotel', 2)$$,
  'admin reorders sections; they are renumbered 0..n');
select throws_ok($$select public.move_travel_section('8fffffff-0000-0000-0000-000000000000', 0)$$,
  'P0002', null, 'moving a deleted section reports it is gone');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.move_travel_section('80000000-0000-0000-0000-000000000001', 0)$$,
  '42501', null, 'a member cannot reorder Travel Info');
update public.travel_sections set title = 'Hacked' where id = '80000000-0000-0000-0000-000000000002';
select is((select title from public.travel_sections where id = '80000000-0000-0000-0000-000000000002'), 'Hotel',
  'a member cannot rename a section');
delete from public.travel_sections where id = '80000000-0000-0000-0000-000000000002';
select isnt_empty($$select 1 from public.travel_sections where id = '80000000-0000-0000-0000-000000000002'$$,
  'a member cannot delete a section');
select is((select count(*)::int from public.travel_sections), 3, 'members can read every section');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
delete from public.travel_sections where id = '80000000-0000-0000-0000-000000000002';
select is_empty($$select 1 from public.travel_sections where id = '80000000-0000-0000-0000-000000000002'$$,
  'admin deletes a section');

-- ---- whiteboard row ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
create temp table wb_before as select version from public.whiteboard;
select lives_ok($$update public.whiteboard set elements = '[{"id":"e1","version":1,"versionNonce":5,"type":"rectangle"}]'$$,
  'a member saves the scene');
select is((select version from public.whiteboard), (select version + 1 from wb_before), 'every save bumps the version');
select is((select updated_by from public.whiteboard), '00000000-0000-0000-0000-00000000000b'::uuid, 'the saver is recorded');
select throws_ok($$update public.whiteboard set elements = '{"not":"a list"}'$$, '23514', null, 'elements must be a list');
select throws_ok($$update public.whiteboard set files = '{"f1":{"path":"../../avatars/x.png","mimeType":"image/png"}}'$$,
  '23514', null, 'file paths must be <uuid>.<ext>');
select throws_ok($$update public.whiteboard set files = '{"f1":{"path":"20000000-0000-0000-0000-000000000001.png","mimeType":"image/svg+xml"}}'$$,
  '23514', null, 'SVG is not an allowed image type');
select throws_ok($$update public.whiteboard set files = '{"f1":"20000000-0000-0000-0000-000000000001.png"}'$$,
  '23514', null, 'each file entry must be an object');
select throws_ok($$update public.whiteboard set files = '[]'$$, '23514', null, 'files must be a map');
select lives_ok($$update public.whiteboard set files = '{"f1":{"path":"20000000-0000-0000-0000-000000000001.png","mimeType":"image/png"}}'$$,
  'a valid file map is accepted');
select throws_ok($$update public.whiteboard set version = 999$$, '42501', null, 'members cannot set the version by hand');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty($$select 1 from public.whiteboard$$, 'a non-member cannot read the whiteboard');
update public.whiteboard set elements = '[]';
reset role;
select is((select jsonb_array_length(elements) from public.whiteboard), 1, 'a non-member cannot wipe the whiteboard');

-- ---- whiteboard images ------------------------------------------------------------
select ok(not ('image/svg+xml' = any (allowed_mime_types)) and file_size_limit = 5242880,
  'the whiteboard bucket takes ≤5 MB raster images only')
  from storage.buckets where id = 'whiteboard';
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('whiteboard', 'evil.svg', '00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'whiteboard object names must be <uuid>.<ext>');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('whiteboard', 'avatars/20000000-0000-0000-0000-000000000009.png', '00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'no folders in the whiteboard bucket');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('whiteboard', '20000000-0000-0000-0000-000000000009.webp', '00000000-0000-0000-0000-00000000000b')$$,
  'a member uploads a whiteboard image');

-- ---- members-only broadcast channel ---------------------------------------------
select set_config('realtime.topic', 'whiteboard', true);
select lives_ok($$insert into realtime.messages (topic, extension, event, payload, private)
  values ('whiteboard', 'broadcast', 'elements', '{}', true)$$, 'a member may broadcast on the whiteboard channel');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private)
  values ('whiteboard', 'broadcast', 'elements', '{}', true)$$, '42501', null, 'a non-member may not broadcast on it');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select set_config('realtime.topic', 'someone-else', true);
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private)
  values ('someone-else', 'broadcast', 'elements', '{}', true)$$, '42501', null, 'the policy only opens the whiteboard topic');

select * from finish();
rollback;
