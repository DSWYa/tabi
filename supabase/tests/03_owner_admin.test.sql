-- Owner emails: guaranteed admin for the trip owner, no "first to join" race once configured.
-- Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---- fixtures --------------------------------------------------------------
delete from public.itinerary_items;
delete from public.places;
delete from public.profiles;
delete from public.admin_emails;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'relative@test.local', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'Owner@Test.Local', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'impostor@test.local', null),
  ('00000000-0000-0000-0000-0000000000a4', 'late-owner@test.local', now()),
  ('00000000-0000-0000-0000-0000000000a5', 'owner-two@test.local', now());
update public.family_invite set code = 'TEST-CODE-3', enabled = true;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- Back to the SQL-editor role (postgres) for owner-only setup.
create function pg_temp.sql_editor() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select matches(public.add_admin_email('  OWNER@test.local '), '^owner@test\.local is an owner email\.',
  'owner email is registered, normalized');
select public.add_admin_email('impostor@test.local');
select public.add_admin_email('owner-two@test.local');

-- ---- the app can't see or change owner emails --------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select * from public.admin_emails$$, '42501', null, 'members cannot read owner emails');
select throws_ok($$insert into public.admin_emails values ('me@test.local')$$, '42501', null, 'members cannot add owner emails');
select throws_ok($$select public.add_admin_email('relative@test.local')$$, '42501', null, 'the app cannot call add_admin_email');

-- ---- no race: arriving first doesn't make you admin --------------------------
select is((public.join_family('TEST-CODE-3', 'Relative')).role, 'member',
  'with an owner configured, the first joiner is only a member');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is((public.join_family('TEST-CODE-3', 'Owner')).role, 'admin',
  'the owner becomes admin even after someone else joined first (case-insensitive email)');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is((public.join_family('TEST-CODE-3', 'Impostor')).role, 'member',
  'an unconfirmed email never grants admin');

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$select public.join_family('WRONG', 'Owner Two')$$, '42501', null,
  'an owner still needs the family code');

-- ---- owner registered after already joining ---------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is((public.join_family('TEST-CODE-3', 'Late Owner')).role, 'member', 'joins as a member first');
select pg_temp.sql_editor();
select matches(public.add_admin_email('late-owner@test.local'), 'now an admin', 'registering the email reports the promotion');
select is((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'), 'admin',
  'an existing member is promoted immediately');

-- ---- without owner emails, the original "first joiner is admin" still applies ---
delete from public.profiles;
delete from public.admin_emails;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is((public.join_family('TEST-CODE-3', 'Relative')).role, 'admin',
  'no owner configured: first joiner becomes admin');

select * from finish();
rollback;
