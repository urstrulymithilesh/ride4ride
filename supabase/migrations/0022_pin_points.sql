-- Ride4Ride — Phase 22: near-pickup map pins.
-- =====================================================================
-- FOUNDER DECISION (2026-11-15). Feed pins sat on the pickup CITY CENTER
-- plus a ≤1.5mi jitter, so an edge-of-town pickup rendered miles from
-- where the rider actually stands. Pins now sit NEAR the pickup: the
-- exact geocoded point moved a deterministic 0.05–0.25 miles, computed
-- once at post time. Exact points never leave row-protected
-- ride_locations; only the pre-jittered pin is world-readable, and the
-- feed's maxZoom cap keeps houses unidentifiable. Street display stays
-- masked (no house number) per 0015.
--
-- Structural notes (same as 0015/0016/0021): `create or replace` cannot
-- change a parameter list, so the 0021 18-arg signature is dropped first
-- (types named exactly); the grant is re-applied after recreate. The
-- rides_with_location view is DROP + CREATE (r.* re-expansion — 42P16
-- otherwise). RLS posture unchanged: row policies already cover the new
-- columns, and the pin is coarse by design, like city/state/zip.
-- =====================================================================

alter table public.rides
  add column if not exists pin_lat double precision,
  add column if not exists pin_lng double precision;

-- The two halves of a pin travel together ...
alter table public.rides
  drop constraint if exists rides_pin_pair,
  add constraint rides_pin_pair
    check ((pin_lat is null) = (pin_lng is null));

-- ... and only need-ride posts have a pickup to pin (mirrors the
-- rides_from_street_only_for_get rule from 0015).
alter table public.rides
  drop constraint if exists rides_pin_only_for_get,
  add constraint rides_pin_only_for_get
    check (pin_lat is null or type = 'get');

comment on column public.rides.pin_lat is
  'PUBLIC near-pickup pin latitude. Pre-jittered 0.05–0.25mi at post time; never the exact pickup (see ride_locations). Null until 0022 backfills.';
comment on column public.rides.pin_lng is
  'PUBLIC near-pickup pin longitude. Pre-jittered 0.05–0.25mi at post time; never the exact pickup (see ride_locations). Null until 0022 backfills.';

-- get gains the two pin params: drop 18-arg, create 20-arg.
-- NOTE: the pre-0022 18-arg shape must match 0021's recreation exactly.
drop function if exists public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, text, text
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
  p_to_street     text,
  p_pin_lat       double precision,
  p_pin_lng       double precision
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
    distance_meters, from_street, to_street, from_airport,
    pin_lat, pin_lng
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_distance_meters,
    nullif(p_from_street, ''), nullif(p_to_street, ''),
    public.nearest_airport(p_from_lat, p_from_lng),
    p_pin_lat, p_pin_lng
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
  integer, text, date, boolean, text, text,
  double precision, double precision
) from public;
grant execute on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, text, text,
  double precision, double precision
) to authenticated;

-- Backfill: pre-0022 get rides get a deterministic near-pickup pin from
-- their exact stored point (same 0.05–0.25mi band the app computes for
-- new posts; each row derived once, then stable). Rows without an exact
-- point keep NULL and the feed falls back to the city-center pin.
with raw as (
  select
    r.id,
    l.from_lat as lat,
    l.from_lng as lng,
    decode(md5(r.id::text), 'hex') as digest
  from public.rides r
  join public.ride_locations l on l.ride_id = r.id
  where r.type = 'get'
    and r.pin_lat is null
    and l.from_lat is not null
    and l.from_lng is not null
),
jitter as (
  select
    id,
    lat,
    lng,
    ((get_byte(digest, 0)::float8 * 16777216
      + get_byte(digest, 1) * 65536
      + get_byte(digest, 2) * 256
      + get_byte(digest, 3)) / 4294967296.0) * 2 * pi() as angle,
    0.05 + ((((get_byte(digest, 4) * 256
      + get_byte(digest, 5)) % 1000)) / 1000.0) * 0.2 as r_miles
  from raw
)
update public.rides r
set
  pin_lat = j.lat + (j.r_miles / 69) * cos(j.angle),
  pin_lng = j.lng + (j.r_miles / (69 * cos(radians(j.lat)))) * sin(j.angle)
from jitter j
where j.id = r.id;

-- View re-expansion for the re-added columns (DROP + CREATE, per 0015).
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
