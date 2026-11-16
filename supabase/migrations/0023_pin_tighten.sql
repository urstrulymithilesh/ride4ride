-- Ride4Ride — Phase 23: tighten near-pickup pins to the point.
-- =====================================================================
-- FOUNDER DECISION (2026-11-15). 0022 placed pins 0.05–0.25 miles off
-- the pickup; on the feed that still read as "somewhere else". Pins now
-- sit 0.01–0.05 miles off — on the pickup at every zoom the feed
-- allows, still never exactly on it. Same shape as 0022: recompute every
-- get ride's pin from its exact stored point (deterministic per ride),
-- refresh the column comments. The create_get_ride signature is
-- unchanged (the app computes the tighter pin for new posts), and the
-- view needs no touch (r.* already expanded in 0022).
-- =====================================================================

with raw as (
  select
    r.id,
    l.from_lat as lat,
    l.from_lng as lng,
    decode(md5(r.id::text), 'hex') as digest
  from public.rides r
  join public.ride_locations l on l.ride_id = r.id
  where r.type = 'get'
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
    0.01 + ((((get_byte(digest, 4) * 256
      + get_byte(digest, 5)) % 1000) / 1000.0) * 0.04) as r_miles
  from raw
)
update public.rides r
set
  pin_lat = j.lat + (j.r_miles / 69) * cos(j.angle),
  pin_lng = j.lng + (j.r_miles / (69 * cos(radians(j.lat)))) * sin(j.angle)
from jitter j
where j.id = r.id;

comment on column public.rides.pin_lat is
  'PUBLIC near-pickup pin latitude. Pre-jittered 0.01–0.05mi at post time; never the exact pickup (see ride_locations). Recomputed in 0023.';
comment on column public.rides.pin_lng is
  'PUBLIC near-pickup pin longitude. Pre-jittered 0.01–0.05mi at post time; never the exact pickup (see ride_locations). Recomputed in 0023.';
