-- Phase 2 rules: storage, profile constraints, suggestion review, roles and the family code.
-- Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---- fixtures --------------------------------------------------------------
delete from public.itinerary_items;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails; -- owner emails would change who becomes admin
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'member2@test.local');
update public.family_invite set code = 'TEST-CODE-2', enabled = true;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
-- The Storage API sets this before deleting; direct SQL deletes are otherwise blocked by a trigger.
select set_config('storage.allow_delete_query', 'true', true);

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.join_family('TEST-CODE-2', 'Admin');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.join_family('TEST-CODE-2', 'Member');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.join_family('TEST-CODE-2', 'Member Two');

-- ---- storage: avatars -------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', '00000000-0000-0000-0000-00000000000b/me.webp', '00000000-0000-0000-0000-00000000000b')$$,
  'member uploads into their own avatar folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', '00000000-0000-0000-0000-00000000000a/sneaky.webp', '00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'member cannot upload into someone else''s avatar folder');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('avatars', 'loose-file.webp')$$,
  '42501', null, 'avatars must live in a per-user folder');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', '00000000-0000-0000-0000-00000000000c/me.webp', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'signed-in non-member cannot upload an avatar');
select is_empty($$select 1 from storage.objects where bucket_id in ('avatars', 'whiteboard')$$,
  'non-member cannot list family files');

select pg_temp.logout();
select is_empty($$select 1 from storage.objects where bucket_id in ('avatars', 'whiteboard')$$,
  'anonymous visitors cannot list family files');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select isnt_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp'$$,
  'members can list family avatars');
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp';
select isnt_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp'$$,
  'not even an admin can delete someone else''s avatar');
update storage.objects set name = '00000000-0000-0000-0000-00000000000a/stolen.webp'
  where name = '00000000-0000-0000-0000-00000000000b/me.webp';
select isnt_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp'$$,
  'cannot move someone else''s avatar');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$update storage.objects set name = '00000000-0000-0000-0000-00000000000a/moved.webp'
  where name = '00000000-0000-0000-0000-00000000000b/me.webp'$$,
  '42501', null, 'cannot move own avatar into someone else''s folder');
delete from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp';
select is_empty($$select 1 from storage.objects where name = '00000000-0000-0000-0000-00000000000b/me.webp'$$,
  'member deletes their own avatar');

-- ---- storage: whiteboard ----------------------------------------------------
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('whiteboard', '20000000-0000-0000-0000-000000000001.png', '00000000-0000-0000-0000-00000000000b')$$,
  'member uploads a whiteboard image');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('whiteboard', '20000000-0000-0000-0000-000000000002.png', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'non-member cannot upload whiteboard images');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
delete from storage.objects where name = '20000000-0000-0000-0000-000000000001.png';
select isnt_empty($$select 1 from storage.objects where name = '20000000-0000-0000-0000-000000000001.png'$$,
  'member cannot delete someone else''s whiteboard image');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
delete from storage.objects where name = '20000000-0000-0000-0000-000000000001.png';
select is_empty($$select 1 from storage.objects where name = '20000000-0000-0000-0000-000000000001.png'$$,
  'admin can delete any whiteboard image');

-- ---- profile constraints ----------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000b/x.webp' where id = auth.uid()$$,
  'avatar_path may point into own folder');
select throws_ok($$update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000a/x.webp' where id = auth.uid()$$,
  '23514', null, 'avatar_path cannot point at someone else''s picture');
select throws_ok($$update public.profiles set display_name = '   ' where id = auth.uid()$$,
  '23514', null, 'display name cannot be blank');
select throws_ok($$update public.profiles set notification_prefs = '{"place_added": "yes"}' where id = auth.uid()$$,
  '23514', null, 'notification prefs must be booleans');
select lives_ok($$update public.profiles set notification_prefs = '{"place_added": false, "vote_cast": true}', theme = 'dark' where id = auth.uid()$$,
  'member saves notification prefs and theme');
select lives_ok($$update public.profiles set pin_color = 'teal' where id = auth.uid()$$, 'member picks a free pin color');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$update public.profiles set pin_color = 'teal' where id = auth.uid()$$,
  '23505', null, 'second member cannot take the same pin color');
select is((select pin_color from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'teal',
  'the first picker keeps the color');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$update public.profiles set pin_color = 'plum' where id = auth.uid()$$, 'switching color frees the old one');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$update public.profiles set pin_color = 'teal' where id = auth.uid()$$, 'a freed color can be claimed');

-- ---- trip details --------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.trip set name = 'Hijacked' where id = 1;
select isnt((select name from public.trip), 'Hijacked', 'members cannot edit the trip');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.trip set name = 'Tokyo 2026', start_date = '2026-11-20', end_date = '2026-11-29' where id = 1$$,
  'admin sets trip name and dates');
select throws_ok($$update public.trip set end_date = '2026-11-01' where id = 1$$,
  '23514', null, 'trip cannot end before it starts');

-- ---- suggestion review ---------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.itinerary_suggestions (id, title, day, slot, note)
  values ('30000000-0000-0000-0000-000000000001', 'Ramen crawl', '2026-11-24', 'evening', 'first idea');
select lives_ok($$update public.itinerary_suggestions set note = 'better idea' where id = '30000000-0000-0000-0000-000000000001'$$,
  'author edits their pending suggestion');
select throws_ok($$update public.itinerary_suggestions set status = 'approved' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'author cannot approve their own suggestion');
select throws_ok($$update public.itinerary_suggestions set review_note = 'LGTM' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'author cannot write the review note');
update public.itinerary_suggestions set suggested_by = '00000000-0000-0000-0000-00000000000d'
  where id = '30000000-0000-0000-0000-000000000001';
select is((select suggested_by from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'authorship cannot be reassigned');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.itinerary_suggestions set note = 'mine now' where id = '30000000-0000-0000-0000-000000000001';
select is((select note from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001'),
  'better idea', 'other members cannot edit someone else''s suggestion');
delete from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001';
select isnt_empty($$select 1 from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001'$$,
  'other members cannot delete someone else''s suggestion');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.itinerary_suggestions set status = 'approved', review_note = 'Yes!'
  where id = '30000000-0000-0000-0000-000000000001'$$, 'admin approves a suggestion');
select results_eq($$select status, reviewed_by, reviewed_at is not null from public.itinerary_suggestions
  where id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('approved'::text, '00000000-0000-0000-0000-00000000000a'::uuid, true)$$,
  'approval records who reviewed it and when');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.itinerary_suggestions set note = 'sneaky edit' where id = '30000000-0000-0000-0000-000000000001';
select is((select note from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001'),
  'better idea', 'reviewed suggestions are frozen for the author');
delete from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001';
select isnt_empty($$select 1 from public.itinerary_suggestions where id = '30000000-0000-0000-0000-000000000001'$$,
  'author cannot delete a reviewed suggestion');

-- ---- roles and membership RPCs -------------------------------------------
select throws_ok($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'admin')$$,
  '42501', null, 'member cannot promote themselves');
select throws_ok($$select public.rotate_family_code()$$, '42501', null, 'member cannot rotate the family code');
select throws_ok($$select public.remove_member('00000000-0000-0000-0000-00000000000d')$$,
  '42501', null, 'member cannot remove members');
select is_empty($$select * from public.family_invite$$, 'member cannot read the family code');
select is((public.join_family('WHATEVER', 'New Name')).display_name, 'Member',
  'join_family is idempotent for existing members');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'owner')$$,
  '22023', null, 'unknown roles are rejected');
select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'admin');
select is((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'admin',
  'admin promotes a member');
select public.set_member_role('00000000-0000-0000-0000-00000000000a', 'member');
select is((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'member',
  'an admin can step down while another admin remains');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'member')$$,
  '42501', null, 'the last admin cannot step down');
select throws_ok($$select public.remove_member('00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'admins cannot remove themselves');

select ok((select public.rotate_family_code()) <> 'TEST-CODE-2', 'admin rotates the family code');
select ok(not public.check_family_code('TEST-CODE-2'), 'the old code stops working');
select ok(public.check_family_code((select code from public.family_invite)), 'the new code works');

select lives_ok($$select public.remove_member('00000000-0000-0000-0000-00000000000d')$$, 'admin removes a member');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is_empty($$select * from public.profiles$$, 'a removed member sees nothing');
select throws_ok($$select public.join_family('TEST-CODE-2', 'Back again')$$,
  '42501', null, 'a removed member cannot rejoin with the old code');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.family_invite set enabled = false where id = 1;
select ok(not public.check_family_code((select code from public.family_invite)), 'a disabled code is rejected');

select * from finish();
rollback;
