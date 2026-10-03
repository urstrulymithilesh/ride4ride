-- Ride4Ride — Phase 16: airports (display + filter aid, not a join key)
-- =====================================================================
-- THE PROBLEM THIS SOLVES. Airport runs are the wedge use case ("need a
-- ride from ORD tomorrow 5pm"), but the feed only speaks city/state/zip.
-- A small reference table lets posts carry a 3-letter IATA code for
-- display and filtering.
--
-- THE KNOWN RISK IT DOES NOT SOLVE (TODOS.md T-2). Rider airport is
-- DERIVED from geocoded coordinates while captain airport is PICKED BY
-- HAND, so the two disagree at boundaries (ORD/MDW line). That fails
-- silently: two people who should match never see each other. Accepted
-- for the pilot. Mitigation is structural, not a fix: the airport is a
-- display/filter aid, never a match key. Tune the radius_m values below
-- once real posts show how often the mismatch actually occurs.
--
-- PRIVACY. IATA codes are coarse and PUBLIC by design, like city/state.
-- No addresses, no coordinates, nothing person-level.
-- =====================================================================

create table if not exists public.airports (
  iata     text primary key check (iata ~ '^[A-Z]{3}$'),
  name     text not null,
  lat      double precision not null,
  lng      double precision not null,
  radius_m integer not null default 40000 check (radius_m > 0)
);

comment on table public.airports is
  'Reference airports for display/filter. radius_m is the catchment a post must fall in to claim the code; tune per TODOS.md T-2.';

-- Reference data is world-readable (anon included): the feed shows it.
alter table public.airports enable row level security;

drop policy if exists "airports: public read" on public.airports;
create policy "airports: public read"
  on public.airports for select
  using (true);

-- Seed: the pilot's home airports (ORD/MDW) plus major US hubs.
-- Reference data, admin-extendable; insert is idempotent for replays.
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

-- ------------------------------------------------------------------
-- Nearest airport to a point, or NULL when nothing is in range.
-- Plain haversine over a ~10-row table: a sequential scan is correct
-- here, no index needed. IMMUTABLE so it can run inside the create RPC.
-- ------------------------------------------------------------------
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
  'IATA of the nearest seeded airport within its catchment, else NULL. Rider posts derive; captains pick by hand (T-2).';

-- ------------------------------------------------------------------
-- Rides carry one public IATA code. Rider posts derive it from the
-- pickup coordinates; captain posts take the poster's explicit pick
-- (new RPC param below).
-- ------------------------------------------------------------------
alter table public.rides
  add column if not exists from_airport text;

alter table public.rides
  drop constraint if exists rides_from_airport_iata,
  add constraint rides_from_airport_iata
    check (from_airport is null or from_airport ~ '^[A-Z]{3}$');

comment on column public.rides.from_airport is
  'PUBLIC IATA code (display/filter aid, never a match key). Rider: derived by nearest_airport at create time. Captain: poster''s explicit pick.';

-- ------------------------------------------------------------------
-- create_get_ride: derive the airport inside the INSERT. No signature
-- change (derivation is internal), so no drop/re-grant needed.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- create_offer_ride: one new explicit param for the captain's airport
-- pick. `create or replace` cannot change a parameter list, so the old
-- signature is dropped first (same pattern as 0008/0015); the grant is
-- re-applied to the new signature below.
-- ------------------------------------------------------------------
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
  -- The airport pick is normalized to uppercase; empty means none.
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
