-- Phase 2: tighten what members can write to their own profile row.

-- avatar_path must point into the member's own avatars folder (`<uid>/<file>`), so nobody can
-- "borrow" another member's picture or store arbitrary text.
alter table public.profiles
  add constraint profiles_avatar_path_own_folder
  check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 200));

-- Names can't be blank after trimming (join_family trims; direct updates must too).
alter table public.profiles
  add constraint profiles_display_name_not_blank
  check (btrim(display_name) <> '');

-- notification_prefs is { "<kind>": boolean } — reject anything that isn't a boolean value.
alter table public.profiles
  add constraint profiles_notification_prefs_booleans
  check (not jsonb_path_exists(notification_prefs, '$.* ? (@.type() != "boolean")'));
