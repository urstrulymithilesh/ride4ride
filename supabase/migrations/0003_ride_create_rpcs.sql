-- Ride4Ride — Phase 3: relax date rule + atomic post-creation RPCs
-- =====================================================================

-- ------------------------------------------------------------------
-- Relax the date/timing rule: a FUTURE ride must have a date, but a
-- CURRENT ride may optionally carry one (previously it had to be NULL).
-- ------------------------------------------------------------------
alter table public.rides drop constraint if exists rides_future_has_date;
alter table public.rides
  add constraint rides_future_has_date
  check (not is_future or ride_date is not null);

-- ------------------------------------------------------------------
-- create_offer_ride — single public row, owner = auth.uid().
-- SECURITY INVOKER (default) so RLS applies: an unauthenticated caller
-- (auth.uid() is null) cannot insert.
-- ------------------------------------------------------------------
create or replace function public.create_offer_ride(
  p_from_city   text,
  p_from_state  text,
  p_from_zip    text,
  p_to_city     text,
  p_to_state    text,
  p_to_zip      text,
  p_description text,
  p_ride_date   date,
  p_is_future   boolean,
  p_expires_at  timestamptz
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

  insert into public.rides (
    type, owner_id,
    from_city, from_state, from_zip,
    to_city, to_state, to_zip,
    description, ride_date, is_future, status, expires_at
  ) values (
    'offer', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_expires_at
  )
  returning * into v_ride;

  return v_ride;
end;
$$;

-- ------------------------------------------------------------------
-- create_get_ride — inserts the public row AND the sensitive location
-- atomically (both succeed or neither). Coarse city/state/zip are
-- derived server-side from geocoding and passed in; addresses/coords go
-- into the row-protected ride_locations table.
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
  p_expires_at    timestamptz
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

  insert into public.rides (
    type, owner_id,
    from_city, from_state, from_zip,
    to_city, to_state, to_zip,
    description, ride_date, is_future, status,
    distance_meters, expires_at
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_distance_meters, p_expires_at
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

-- Only signed-in users may post. (Functions default to EXECUTE for PUBLIC.)
revoke all on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, timestamptz
) from public;
grant execute on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, timestamptz
) to authenticated;

revoke all on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, timestamptz
) from public;
grant execute on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, timestamptz
) to authenticated;
