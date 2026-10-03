-- Ride4Ride — Phase 15: masked street display for rider posts
-- =====================================================================
-- THE GAP THIS CLOSES. The v3 pilot's rider/captain asymmetry table
-- requires rider posts to display "street name + city + state, no number"
-- publicly. `rides` had no street column, so rider cards showed only the
-- city — less useful for someone scanning a feed for their street.
--
-- PRIVACY. These columns are PUBLIC by design (world-readable for active
-- rides, like city/state/zip). They must NEVER contain a house number.
-- The value is derived server-side from the Mapbox result's street NAME
-- (its `text`, not its `address` house-number field), with a defensive
-- strip of any leading digits in the app layer. The full addresses stay
-- in row-protected `ride_locations`, unchanged.
--
-- Like `distance_meters`, masked streets are meaningful only for 'get'
-- rides (address -> address), enforced by check constraints below.
-- =====================================================================

alter table public.rides
  add column if not exists from_street text,
  add column if not exists to_street   text;

-- Rider posts only, mirroring rides_distance_only_for_get in 0002.
alter table public.rides
  drop constraint if exists rides_from_street_only_for_get,
  add constraint rides_from_street_only_for_get
    check (from_street is null or type = 'get');

alter table public.rides
  drop constraint if exists rides_to_street_only_for_get,
  add constraint rides_to_street_only_for_get
    check (to_street is null or type = 'get');

comment on column public.rides.from_street is
  'PUBLIC masked pickup street (name only, never a house number). Rider posts only. Derived at geocode time.';
comment on column public.rides.to_street is
  'PUBLIC masked drop-off street (name only, never a house number). Rider posts only. Derived at geocode time.';

-- ------------------------------------------------------------------
-- Recreate the view so the new columns are visible through it.
-- `r.*` in a view is expanded at CREATE time, so an ALTER TABLE alone
-- would leave from_street/to_street out of rides_with_location.
--
-- DROP + CREATE, not CREATE OR REPLACE: migration 0006 added
-- `expiry_notified_at` to `rides` after the view was created in 0002,
-- so the live view's column list is frozen at the 0002 shape while a
-- re-expansion produces the wider current shape. REPLACE requires the
-- new list to match positionally and fails with 42P16 ("cannot change
-- name of view column"); dropping first avoids that. Nothing depends on
-- the view (no grants, no dependent objects — policies live on the
-- tables, and the view is security_invoker), so this is safe.
-- ------------------------------------------------------------------
drop view if exists public.rides_with_location;

create view public.rides_with_location
with (security_invoker = on) as
select
  r.*,
  l.from_address,
  l.to_address,
  l.from_lat,
  l.from_lng,
  l.to_lat,
  l.to_lng
from public.rides r
left join public.ride_locations l on l.ride_id = r.id;

comment on view public.rides_with_location is
  'RLS-aware join. Address columns are non-NULL only for the owner or an agreed reveal.';

-- ------------------------------------------------------------------
-- Extend create_get_ride with the two masked-street params.
-- `create or replace` cannot change a parameter list, so the 0008
-- signature is dropped first (same pattern as 0008 itself). Dropping
-- also drops the grant, so it is re-applied below.
-- ------------------------------------------------------------------
drop function if exists public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean
);

create or replace function public.create_get_ride(
  p_from_city     text,
  p_from_state    text,
  p_from_zip      text,
  p_to_city       text,
  p_to_state      text,
  p_to_zip        text,
  p_from_address  text,
  p_to_address    text,
  p_from_lat      double precision,
  p_from_lng      double precision,
  p_to_lat        double precision,
  p_to_lng        double precision,
  p_distance_meters integer,
  p_description   text,
  p_ride_date     date,
  p_is_future     boolean,
  p_from_street   text,
  p_to_street     text
)
returns public.rides
language plpgsql
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- expires_at deliberately omitted: trg_set_ride_expiry derives it.
  insert into public.rides (
    type, owner_id,
    from_city, from_state, from_zip,
    to_city, to_state, to_zip,
    description, ride_date, is_future, status,
    distance_meters, from_street, to_street
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_distance_meters,
    nullif(p_from_street, ''), nullif(p_to_street, '')
  )
  returning * into v_ride;

  -- owner_id is forced from the ride by the ride_locations trigger.
  insert into public.ride_locations (
    ride_id, from_address, to_address,
    from_lat, from_lng, to_lat, to_lng
  ) values (
    v_ride.id, p_from_address, p_to_address,
    p_from_lat, p_from_lng, p_to_lat, p_to_lng
  );

  return v_ride;
end;
$$;

revoke all on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, text, text
) from public;
grant execute on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, text, text
) to authenticated;
