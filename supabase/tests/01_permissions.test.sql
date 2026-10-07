-- Permission rules, exercised as real roles. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ---- fixtures --------------------------------------------------------------
-- Start from an empty family (rolled back at the end) so seed data can't affect results.
delete from public.itinerary_items;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails; -- owner emails would change who becomes admin
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test.local');
update public.family_invite set code = 'TEST-CODE-1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- ---- anonymous visitors ------------------------------------------------------
select pg_temp.logout();
select ok(public.check_family_code('test code 1'), 'code check ignores case/spacing/punctuation');
select ok(not public.check_family_code('nope'), 'wrong code is rejected');
select throws_ok('select * from public.places', '42501', null, 'anon cannot read places');
select throws_ok('select * from public.family_invite', '42501', null, 'anon cannot read the family code');

-- ---- joining -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((public.join_family('TEST-CODE-1', 'Admin')).role, 'admin', 'first member becomes admin');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.join_family('WRONG', 'Member')$$, '42501', null, 'invalid code cannot join');
select is((public.join_family('TEST-CODE-1', 'Member')).role, 'member', 'second member joins as member');

-- ---- signed-in but not a member ----------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty('select * from public.trip', 'non-member sees no trip data');
select is_empty('select * from public.profiles', 'non-member sees no member list');

-- ---- profiles ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$update public.profiles set role = 'admin' where id = auth.uid()$$,
  '42501', null, 'member cannot make themselves admin');
select lives_ok($$update public.profiles set pin_color = 'sakura' where id = auth.uid()$$, 'member picks a pin color');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok($$update public.profiles set pin_color = 'sakura' where id = auth.uid()$$,
  '23505', null, 'a taken pin color cannot be claimed');
update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Member', 'cannot edit someone else''s profile');

-- ---- places ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.places (id, name, status) values ('10000000-0000-0000-0000-000000000001', 'teamLab', 'in_plan');
select is((select status from public.places where id = '10000000-0000-0000-0000-000000000001'),
  'awaiting', 'new places always start awaiting a decision');
select throws_ok($$update public.places set status = 'in_plan' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot change official status');
select lives_ok($$update public.places set notes = 'Book ahead' where id = '10000000-0000-0000-0000-000000000001'$$,
  'creator edits own place');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.places (id, name) values ('10000000-0000-0000-0000-000000000002', 'Admin spot');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
delete from public.places where id = '10000000-0000-0000-0000-000000000002';
select isnt_empty($$select 1 from public.places where id = '10000000-0000-0000-0000-000000000002'$$,
  'member cannot delete someone else''s place');

-- ---- votes ---------------------------------------------------------------
select lives_ok($$insert into public.votes (place_id, vote) values ('10000000-0000-0000-0000-000000000001', 'yes')$$,
  'member votes');
select throws_ok($$insert into public.votes (place_id, user_id, vote)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'no')$$,
  '42501', null, 'cannot vote on behalf of someone else');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.places set status = 'in_plan' where id = '10000000-0000-0000-0000-000000000001';
select is((select status from public.places where id = '10000000-0000-0000-0000-000000000001'),
  'in_plan', 'admin changes status');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.votes set vote = 'no' where place_id = '10000000-0000-0000-0000-000000000001';
select is((select vote from public.votes where place_id = '10000000-0000-0000-0000-000000000001'),
  'yes', 'votes are frozen once a decision is made');

-- ---- itinerary + travel info ------------------------------------------------
select throws_ok($$insert into public.itinerary_items (title, day) values ('Sneaky', '2026-11-22')$$,
  '42501', null, 'member cannot edit the official itinerary');
select lives_ok($$insert into public.itinerary_suggestions (title, day, slot, status)
  values ('Ramen', '2026-11-24', 'evening', 'approved')$$, 'member submits a suggestion');
select is((select status from public.itinerary_suggestions limit 1), 'pending',
  'suggestions always start pending');
select throws_ok($$insert into public.travel_sections (title) values ('Mine')$$,
  '42501', null, 'member cannot edit Travel Info');

-- Deleting a scheduled place keeps the itinerary entry, named after the place.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.itinerary_items (place_id, day) values ('10000000-0000-0000-0000-000000000001', '2026-11-24');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
delete from public.places where id = '10000000-0000-0000-0000-000000000001';
select is((select title from public.itinerary_items where day = '2026-11-24'), 'teamLab',
  'deleting a place keeps its itinerary entry');

select * from finish();
rollback;
