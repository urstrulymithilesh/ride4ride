-- Ride4Ride — Phase 21: airports return as matchable post tags
-- =====================================================================
-- FOUNDER DECISION (2026-10-10). 0016 built the airports system; 0018
-- removed it entirely; scoping by airport pick needs it back. This
-- re-adds the match-relevant pieces ONLY:
--
--   airports reference table (IATA/lat/lng/catchment) + open read,
--   nearest_airport() haversine, rides.from_airport (+ IATA check),
--   derivation inside create_get_ride, explicit pick param on
--   create_offer_ride.
--
-- DELIBERATELY NOT RESTORED: wanted_routes.from_airport/to_airport.
-- Those described unserved demand in free text; the wanted form ships
-- without them and matching runs against rides, so they stay gone.
--
-- Same structural notes as 0015/0016: view is DROP + CREATE (not REPLACE;
-- ADD and DROP both change the r.* shape — 42P16 otherwise), every DROP
-- is IF EXISTS, the offer drop names the exact 9-arg signature, the get
-- RPC keeps its 18-arg signature (CREATE OR REPLACE). Nothing else
-- references these objects (no FKs), and the app side ships with this
-- migration. RLS posture unchanged: IATA codes are coarse and public,
-- like city/state — no addresses, no coordinates, nothing person-level.
-- =====================================================================

create table if not exists public.airports (
  iata     text primary key check (iata ~ '^[A-Z]{3}$'),
  name     text not null,
  lat      double precision not null,
  lng      double precision not null,
  radius_m integer not null default 40000 check (radius_m > 0)
);

comment on table public.airports is
  'Reference airports for scoping/display. radius_m is the catchment a post must fall in to claim the code. Restored in 0021 after 0018 removed the 0016 system; wanted-routes airport text stays removed.';

alter table public.airports enable row level security;

drop policy if exists "airports: public read" on public.airports;
create policy "airports: public read"
  on public.airports for select
  using (true);

insert into public.airports (iata, name, lat, lng) values
  ('ORD', 'Chicago O''Hare',  41.9742,  -87.9073),
  ('MDW', 'Chicago Midway',  41.7868,  -87.7522),
  ('LAX', 'Los Angeles',     33.9425, -118.4081),
  ('JFK', 'New York JFK',    40.6413,  -73.7781),
  ('ATL', 'Atlanta',         33.6407,  -84.4277),
  ('DFW', 'Dallas/Fort Worth', 32.8998, -97.0403),
  ('DEN', 'Denver',          39.8561, -104.6737),
  ('SFO', 'San Francisco',   37.6213, -122.3790),
  ('SEA', 'Seattle-Tacoma',  47.4502, -122.3088),
  ('BOS', 'Boston Logan',    42.3656,  -71.0096)
on conflict (iata) do nothing;

create or replace function public.nearest_airport(
  p_lat double precision,
  p_lng double precision
)
returns text
language sql
immutable
set search_path = public
as $$
  select q.iata
    from (
      select a.iata,
             (6371000 * 2 * asin(sqrt(
               power(sin(radians(a.lat - p_lat) / 2), 2) +
               cos(radians(p_lat)) * cos(radians(a.lat)) *
               power(sin(radians(a.lng - p_lng) / 2), 2)
             ))) as dist_m,
             a.radius_m
        from public.airports a
    ) q
   where q.dist_m <= q.radius_m
   order by q.dist_m asc
   limit 1;
$$;

comment on function public.nearest_airport(double precision, double precision) is
  'IATA of the nearest seeded airport within its catchment, else NULL. Rider posts derive; captains pick by hand.';

alter table public.rides
  add column if not exists from_airport text;

alter table public.rides
  drop constraint if exists rides_from_airport_iata,
  add constraint rides_from_airport_iata
    check (from_airport is null or from_airport ~ '^[A-Z]{3}$');

comment on column public.rides.from_airport is
  'PUBLIC IATA code for airport scoping/display. Rider: derived by nearest_airport at create time. Captain: explicit pick.';

-- get keeps its 18-arg signature (derivation is internal): OR REPLACE.
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
    distance_meters, from_street, to_street, from_airport
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_distance_meters,
    nullif(p_from_street, ''), nullif(p_to_street, ''),
    public.nearest_airport(p_from_lat, p_from_lng)
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

-- offer gains the explicit pick back: drop 9-arg, create 10-arg.
-- NOTE: the pre-0021 9-arg shape must match 0018's recreation exactly
-- (the 0016 10-arg signature is long gone from any live database).
drop function if exists public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean
);

create or replace function public.create_offer_ride(
  p_from_city    text,
  p_from_state   text,
  p_from_zip     text,
  p_to_city      text,
  p_to_state     text,
  p_to_zip       text,
  p_description  text,
  p_ride_date    date,
  p_is_future    boolean,
  p_from_airport text
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
    description, ride_date, is_future, status, from_airport
  ) values (
    'offer', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', nullif(upper(nullif(trim(p_from_airport), '')), '')
  )
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke all on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, text
) from public;
grant execute on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, text
) to authenticated;

-- View re-expansion for the re-added column (DROP + CREATE, per 0015).
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
