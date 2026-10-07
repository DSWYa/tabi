-- Phase 3: places, voting, plans & map. Tighten what can be stored in places and the shared geocode cache.
-- Who-can-do-what for places and votes is unchanged (see init migration); these are data-shape rules.

-- ---- places ------------------------------------------------------------------

alter table public.places
  add constraint places_name_not_blank check (btrim(name) <> ''),
  -- Rendered as a link, so only web URLs (never `javascript:` or `data:`).
  add constraint places_website_http check (website is null or website ~* '^https?://[^[:space:]]+$'),
  add constraint places_geocoded_address_length check (char_length(geocoded_address) <= 300),
  -- A pin exists exactly when the place was found (geocoded) or placed by hand.
  add constraint places_pin_matches_geocode_status
    check ((geocode_status in ('found', 'manual')) = (lat is not null));

-- ---- geocode cache -----------------------------------------------------------
-- Shared by the family so nobody geocodes the same query twice (Nominatim allows ~1 request/second).
-- Keys are normalized in the browser (NFKC, lowercase, single spaces); the DB checks the parts it can
-- check reliably regardless of collation: trimmed, single-spaced, no ASCII capitals.

alter table public.geocode_cache
  add constraint geocode_cache_query_normalized check (
    char_length(query) between 1 and 300
    and query = btrim(regexp_replace(query, '[[:space:]]+', ' ', 'g'))
    and query !~ '[A-Z]'
  ),
  add constraint geocode_cache_found_has_coords check (found = (lat is not null and lng is not null)),
  add constraint geocode_cache_lat_range check (lat between -90 and 90),
  add constraint geocode_cache_lng_range check (lng between -180 and 180),
  add constraint geocode_cache_display_name_length check (char_length(display_name) <= 500);
