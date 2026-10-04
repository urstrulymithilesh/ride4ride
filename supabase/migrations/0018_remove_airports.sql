-- Ride4Ride — Phase 18: remove the airports concept entirely
-- =====================================================================
-- FOUNDER DECISION (2026-10-04). The airports system — reference table,
-- proximity derivation, captain pick, IATA display/filter, and the
-- wanted-routes airport text fields — is removed, not deferred.
--
-- WHAT GOES, AND WHY EACH PIECE IS SAFE TO DROP.
--   airports table + policy + nearest_airport(): reference data only;
--     nothing else references them (no FKs anywhere).
--   rides.from_airport (+ IATA check): derived or picked display data;
--     dropping the column drops its check with it.
--   RPC params: create_offer_ride loses p_from_airport (signature
--     changes, so drop + recreate + re-grant, the 0008/0015 pattern);
--     create_get_ride keeps its 18-arg signature (derivation was
--     internal), so plain CREATE OR REPLACE suffices.
--   wanted_routes.from_airport/to_airport (+ IATA checks): optional
--     user-typed route text; no FKs, no code may reference them after
--     the app-side removal ships with this migration.
--   rides_with_location view: `r.*` is frozen at CREATE time, and both
--     ADD (0015 lesson, 42P16) and DROP change the shape — so DROP VIEW
--     + CREATE VIEW again. Nothing depends on the view (policies live
--     on the tables; no grants), same as 0015.
--
-- IDEMPOTENCY. Every DROP is IF EXISTS; the view is dropped before
-- recreation; the offer RPC drop names the exact 10-arg signature.
-- Safe to replay (CI `db reset`, preview branches).
-- =====================================================================

-- ---- 1. Reference objects -------------------------------------------
drop view if exists public.rides_with_location;

drop function if exists public.nearest_airport(double precision, double precision);

drop policy if exists "airports: public read" on public.airports;
drop table if exists public.airports;

-- ---- 2. rides.from_airport -------------------------------------------
alter table public.rides
  drop constraint if exists rides_from_airport_iata;

alter table public.rides
  drop column if exists from_airport;

-- ---- 3. wanted_routes airport text columns ---------------------------
alter table public.wanted_routes
  drop constraint if exists wanted_routes_from_airport_iata,
  drop constraint if exists wanted_routes_to_airport_iata;

alter table public.wanted_routes
  drop column if exists from_airport,
  drop column if exists to_airport;

-- ---- 4. create_offer_ride back to the 9-arg shape --------------------
drop function if exists public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, text
);

create or replace function public.create_offer_ride(
  p_from_city   text,
  p_from_state  text,
  p_from_zip    text,
  p_to_city     text,
  p_to_state    text,
  p_to_zip      text,
  p_description text,
  p_ride_date   date,
  p_is_future   boolean
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
    description, ride_date, is_future, status
  ) values (
    'offer', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active'
  )
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke all on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean
) from public;
grant execute on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean
) to authenticated;

-- ---- 5. create_get_ride without the derivation ----------------------
-- Same 18-arg signature as 0015, so CREATE OR REPLACE (no drop).
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

-- ---- 6. Recreate the view over the narrower shape -------------------
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
