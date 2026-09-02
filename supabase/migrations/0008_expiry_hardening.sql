-- Ride4Ride — Phase 8: expiry hardening
-- =====================================================================
-- RULE: a post expires exactly 7 days after the ride's scheduled date
-- passes. NOT 7 days after posting.
--
--   ride_date IS NOT NULL -> (ride_date + 8 days) at midnight
--                            i.e. the ride day ends, then 7 full days
--   ride_date IS NULL     -> created_at + 7 days   (current / ASAP posts)
--
-- Note `0003` relaxed `rides_future_has_date` to
-- `check (not is_future or ride_date is not null)`, so a CURRENT ride may
-- also carry a date. The rule above handles both without branching on
-- is_future: if there is a date, it wins.
--
-- WHY A TRIGGER RATHER THAN FIXING THE CALLERS.
-- Expiry was previously settable from the client in four places:
--   1. an "Auto-expire after 3/7/14/30 days" <select> in the post form
--   2. computeExpiresAt() in src/lib/validations/rides.ts
--   3. the p_expires_at parameter on both create RPCs
--   4. a direct `update rides set expires_at = ...` in repostRide(),
--      which the "rides: owner updates own" RLS policy permits
-- Fixing only the RPCs would leave (4) wide open: any owner could PATCH
-- their own row to any expiry. A BEFORE INSERT OR UPDATE trigger is the
-- only place that closes every path at once, including code paths that
-- do not exist yet.
--
--          caller supplies expires_at
--                    |
--                    v
--        +-----------------------+
--        | trg_set_ride_expiry   |  <- BEFORE INSERT OR UPDATE, every row
--        |  new.expires_at :=    |
--        |  ride_expires_at(...) |
--        +-----------------------+
--                    |
--                    v
--        value written is ALWAYS derived, never caller-supplied
-- =====================================================================

-- ------------------------------------------------------------------
-- The rule, as a testable function. Immutable so it can be used in
-- checks and proofs; the trigger supplies created_at rather than
-- calling now() in here.
-- ------------------------------------------------------------------
create or replace function public.ride_expires_at(
  p_ride_date   date,
  p_created_at  timestamptz
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when p_ride_date is not null then (p_ride_date + 8)::timestamptz
    else p_created_at + interval '7 days'
  end;
$$;

comment on function public.ride_expires_at(date, timestamptz) is
  'Post expiry rule: 7 days after the ride date passes, or created_at + 7 days when there is no ride date. Single source of truth.';

-- ------------------------------------------------------------------
-- Trigger: expiry is DERIVED, never accepted from the caller. Fires on
-- every insert and every update (not just updates OF specific columns)
-- so that an update touching only expires_at is still overwritten.
-- ------------------------------------------------------------------
create or replace function public.set_ride_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := public.ride_expires_at(
    new.ride_date,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;

drop trigger if exists trg_set_ride_expiry on public.rides;
create trigger trg_set_ride_expiry
  before insert or update on public.rides
  for each row execute function public.set_ride_expiry();

-- Recompute any rows created under the old rules.
update public.rides
   set expires_at = public.ride_expires_at(ride_date, created_at)
 where expires_at is distinct from public.ride_expires_at(ride_date, created_at);

-- ------------------------------------------------------------------
-- Drop the p_expires_at parameter from both create RPCs.
-- `create or replace` cannot change a parameter list, so the old
-- signatures are dropped first. Dropping also drops their grants, so
-- the revoke/grant pair is re-applied to the new signatures below.
-- ------------------------------------------------------------------
drop function if exists public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, timestamptz
);
drop function if exists public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, timestamptz
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
  p_is_future     boolean
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
    distance_meters
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date, coalesce(p_is_future, false),
    'active', p_distance_meters
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
  text, text, text, text, text, text, text, date, boolean
) from public;
grant execute on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean
) to authenticated;

revoke all on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean
) from public;
grant execute on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean
) to authenticated;
