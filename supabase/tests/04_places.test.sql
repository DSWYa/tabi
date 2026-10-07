-- Phase 3 rules: places data shape, pins, voting lifecycle and the shared geocode cache.
-- Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---- fixtures --------------------------------------------------------------
delete from public.itinerary_items;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails;
delete from public.geocode_cache;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'member2@test.local');
update public.family_invite set code = 'TEST-CODE-4', enabled = true;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.join_family('TEST-CODE-4', 'Admin');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select public.join_family('TEST-CODE-4', 'Member');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select public.join_family('TEST-CODE-4', 'Member Two');

-- ---- place data shape ------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$insert into public.places (name) values ('   ')$$, '23514', null, 'place name cannot be blank');
select throws_ok($$insert into public.places (name, website) values ('XSS', 'javascript:alert(1)')$$,
  '23514', null, 'website must be an http(s) link');
select throws_ok($$insert into public.places (name, website) values ('Data', 'data:text/html,hi')$$,
  '23514', null, 'data: URLs are rejected');
select lives_ok($$insert into public.places (id, name, category, priority, price_jpy, address, website)
  values ('40000000-0000-0000-0000-000000000001', 'Shibuya Sky', 'attraction', 5, 2500,
          '2-24-12 Shibuya, Shibuya City, Tokyo', 'https://www.shibuya-scramble-square.com/sky/')$$,
  'member adds a place with an https website');
select throws_ok($$insert into public.places (name, priority) values ('Too keen', 6)$$, '23514', null, 'priority is 1–5');
select throws_ok($$insert into public.places (name, price_jpy) values ('Refund', -1)$$, '23514', null, 'price cannot be negative');
select throws_ok($$insert into public.places (name, category) values ('Odd', 'karaoke')$$, '23514', null, 'unknown categories are rejected');
select is((select added_by from public.places where id = '40000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'the creator is recorded as added_by');

-- ---- pins / geocoding fields -------------------------------------------------
select throws_ok($$update public.places set lat = 35.65, lng = 139.70 where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a pin needs a found/manual geocode status');
select throws_ok($$update public.places set geocode_status = 'found' where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', null, '"found" needs coordinates');
select throws_ok($$update public.places set lat = 35.65, geocode_status = 'manual' where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'lat and lng go together');
select lives_ok($$update public.places set lat = 35.6585, lng = 139.7022, geocode_status = 'found',
  geocoded_address = '2-24-12 Shibuya, Shibuya City, Tokyo' where id = '40000000-0000-0000-0000-000000000001'$$,
  'creator stores a geocoded pin');
select lives_ok($$update public.places set lat = 35.6590, lng = 139.7000, geocode_status = 'manual'
  where id = '40000000-0000-0000-0000-000000000001'$$, 'creator corrects the pin by hand');
select lives_ok($$update public.places set lat = null, lng = null, geocode_status = 'not_found'
  where id = '40000000-0000-0000-0000-000000000001'$$, 'a place can lose its pin when not found');
update public.places set added_by = '00000000-0000-0000-0000-00000000000d' where id = '40000000-0000-0000-0000-000000000001';
select is((select added_by from public.places where id = '40000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'ownership cannot be handed to someone else');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
update public.places set lat = 0, lng = 0, geocode_status = 'manual' where id = '40000000-0000-0000-0000-000000000001';
select is((select geocode_status from public.places where id = '40000000-0000-0000-0000-000000000001'),
  'not_found', 'other members cannot move someone else''s pin');
update public.places set name = 'Renamed' where id = '40000000-0000-0000-0000-000000000001';
select is((select name from public.places where id = '40000000-0000-0000-0000-000000000001'),
  'Shibuya Sky', 'other members cannot edit someone else''s place');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.places set lat = 35.6585, lng = 139.7022, geocode_status = 'manual'
  where id = '40000000-0000-0000-0000-000000000001'$$, 'admin corrects anyone''s pin');
select is((select geocode_status from public.places where id = '40000000-0000-0000-0000-000000000001'),
  'manual', 'the admin''s correction is saved');

-- ---- voting lifecycle ----------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'maybe')$$,
  'member votes maybe');
select lives_ok($$update public.votes set vote = 'yes' where place_id = '40000000-0000-0000-0000-000000000001' and user_id = auth.uid()$$,
  'member changes their vote while voting is open');
select throws_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'no')$$,
  '23505', null, 'one vote per member per place');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'no')$$,
  'another member votes');
update public.votes set vote = 'no' where place_id = '40000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-00000000000d';
select is((select vote from public.votes where place_id = '40000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-00000000000d'), 'yes', 'cannot change someone else''s vote');
delete from public.votes where place_id = '40000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000d';
select is((select count(*)::int from public.votes where place_id = '40000000-0000-0000-0000-000000000001'), 2,
  'cannot withdraw someone else''s vote');
delete from public.votes where place_id = '40000000-0000-0000-0000-000000000001' and user_id = auth.uid();
select is((select count(*)::int from public.votes where place_id = '40000000-0000-0000-0000-000000000001'), 1,
  'member withdraws their own vote');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.places set status = 'rejected' where id = '40000000-0000-0000-0000-000000000001';
select results_eq($$select status, status_changed_by, status_changed_at is not null from public.places
  where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('rejected'::text, '00000000-0000-0000-0000-00000000000a'::uuid, true)$$,
  'admin rejects; who and when are recorded');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'yes')$$,
  '42501', null, 'cannot vote once a decision is made');
delete from public.votes where place_id = '40000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.votes where place_id = '40000000-0000-0000-0000-000000000001'), 1,
  'votes cannot be withdrawn after a decision');
select throws_ok($$update public.places set status = 'awaiting' where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a member cannot reopen voting');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.places set status = 'awaiting' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'yes')$$,
  'voting works again after the admin reopens it');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into public.votes (place_id, vote) values ('40000000-0000-0000-0000-000000000001', 'yes')$$,
  '42501', null, 'non-members cannot vote');

-- ---- geocode cache -----------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok($$insert into public.geocode_cache (query, found, lat, lng, display_name)
  values ('senso-ji, tokyo', true, 35.7148, 139.7967, 'Sensō-ji, Asakusa, Taito')$$, 'member caches a result');
select lives_ok($$insert into public.geocode_cache (query, found) values ('nowhere street, tokyo', false)$$,
  'member caches a not-found result');
select throws_ok($$insert into public.geocode_cache (query, found) values ('  Senso-ji,   Tokyo ', false)$$,
  '23514', null, 'cache keys must be normalized');
select throws_ok($$insert into public.geocode_cache (query, found) values ('ghost, tokyo', true)$$,
  '23514', null, 'a found result needs coordinates');
select throws_ok($$update public.geocode_cache set lat = 0 where query = 'senso-ji, tokyo'$$,
  '42501', null, 'cached results cannot be rewritten');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is_empty($$select 1 from public.geocode_cache$$, 'non-members cannot read the geocode cache');

select * from finish();
rollback;
