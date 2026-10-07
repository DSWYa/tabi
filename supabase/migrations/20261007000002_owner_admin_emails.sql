-- Owner emails: whoever signs up with one of these (confirmed) emails is always an admin.
-- Set from the Supabase SQL editor (never committed to git):
--   select public.add_admin_email('you@example.com');
-- Once any owner email exists, "first joiner becomes admin" is switched off, so nobody can race the owner.

create table public.admin_emails (
  email      text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  created_at timestamptz not null default now()
);

-- Invisible to the app: no policies, no grants. Only the SQL editor / service role can touch it.
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;

-- True when the signed-in user's *confirmed* email is an owner email. An unconfirmed address proves nothing.
create or replace function public.is_owner_email(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_emails a on a.email = lower(u.email)
    where u.id = uid and u.email_confirmed_at is not null
  );
$$;

-- Register an owner email; promotes that person immediately if they've already joined.
create or replace function public.add_admin_email(email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(btrim(add_admin_email.email));
  promoted int;
begin
  insert into public.admin_emails (email) values (normalized) on conflict do nothing;
  update public.profiles p set role = 'admin'
    from auth.users u
    where u.id = p.id and lower(u.email) = normalized and u.email_confirmed_at is not null and p.role <> 'admin';
  get diagnostics promoted = row_count;
  return case when promoted > 0
    then normalized || ' is an owner email and that member is now an admin.'
    else normalized || ' is an owner email. Sign up with it (and confirm the email) to become admin.' end;
end $$;

create or replace function public.join_family(code text, display_name text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
  new_role text;
  caller_is_owner boolean;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  caller_is_owner := public.is_owner_email(uid);

  select * into result from public.profiles where id = uid;
  if found then
    -- Safety net: an owner who joined before their email was confirmed is promoted if join_family runs again.
    if caller_is_owner and result.role <> 'admin' then
      update public.profiles set role = 'admin' where id = uid returning * into result;
    end if;
    return result;
  end if;

  if not public.check_family_code(code) then
    raise exception 'That family code is not valid' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('tabi.join_family'));
  new_role := case
    when caller_is_owner then 'admin'
    -- With an owner configured, admin is never handed out by arrival order.
    when exists (select 1 from public.admin_emails) then 'member'
    when exists (select 1 from public.profiles where role = 'admin') then 'member'
    else 'admin'
  end;

  insert into public.profiles (id, display_name, role)
  values (uid, left(btrim(join_family.display_name), 40), new_role)
  returning * into result;
  return result;
end $$;

-- SQL-editor-only helpers: not callable from the app.
revoke execute on function public.add_admin_email(text) from public, anon, authenticated;
revoke execute on function public.is_owner_email(uuid) from public, anon, authenticated;
