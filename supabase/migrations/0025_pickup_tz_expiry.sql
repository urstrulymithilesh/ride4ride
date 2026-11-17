-- Ride4Ride — Phase 25: date-driven posting model
-- =====================================================================
-- Three retirements and one relocation, all following from the same
-- product decision: ride_date alone describes when a post is for.
--
--   1. is_future is dropped everywhere. Tabs are gone (hail shows every
--      need ride, car shows every give ride), so the flag has no readers
--      left. Its one load-bearing consumer,
--      set_conversation_auto_delete(), now keys on the ride date
--      directly (dated future ride -> ride day + 24h, else now + 24h).
--
--   2. The create RPCs lose p_is_future (offer 10-arg -> 9-arg, get
--      20-arg -> 19-arg). Dropped first with exact signatures (grants
--      re-applied), like 0015/0016/0021/0022.
--
--   3. Day boundaries move to the PICKUP timezone. pickup_tz() maps the
--      ride's from_state to an IANA zone (majority side for split
--      states — FL/IN/KY/MI Eastern; TN/ND/SD/NE/KS/TX Central;
--      ID Mountain; OR/NV Pacific; AZ is America/Phoenix, no DST).
--      Unknown states fall back to UTC. This mirrors
--      src/lib/pickup-tz.ts — the two tables are pointed at each other
--      and must change together until the per-city lookup lands.
--
--   4. ride_expires_at() takes the zone as a 5th argument instead of a
--      hardcoded one, so the anytime/at rules land on the poster's day.
-- =====================================================================

-- ------------------------------------------------------------------
-- Pickup timezone from the origin state code.
-- ------------------------------------------------------------------
create or replace function public.pickup_tz(p_state text)
returns text
language sql
immutable
set search_path = public
as $$
  select case upper(trim(coalesce(p_state, '')))
    when 'CT' then 'America/New_York'
    when 'DE' then 'America/New_York'
    when 'DC' then 'America/New_York'
    when 'FL' then 'America/New_York'
    when 'GA' then 'America/New_York'
    when 'IN' then 'America/New_York'
    when 'KY' then 'America/New_York'
    when 'ME' then 'America/New_York'
    when 'MD' then 'America/New_York'
    when 'MA' then 'America/New_York'
    when 'MI' then 'America/New_York'
    when 'NH' then 'America/New_York'
    when 'NJ' then 'America/New_York'
    when 'NY' then 'America/New_York'
    when 'NC' then 'America/New_York'
    when 'OH' then 'America/New_York'
    when 'PA' then 'America/New_York'
    when 'RI' then 'America/New_York'
    when 'SC' then 'America/New_York'
    when 'VT' then 'America/New_York'
    when 'VA' then 'America/New_York'
    when 'WV' then 'America/New_York'
    when 'AL' then 'America/Chicago'
    when 'AR' then 'America/Chicago'
    when 'IL' then 'America/Chicago'
    when 'IA' then 'America/Chicago'
    when 'KS' then 'America/Chicago'
    when 'LA' then 'America/Chicago'
    when 'MN' then 'America/Chicago'
    when 'MS' then 'America/Chicago'
    when 'MO' then 'America/Chicago'
    when 'NE' then 'America/Chicago'
    when 'ND' then 'America/Chicago'
    when 'OK' then 'America/Chicago'
    when 'SD' then 'America/Chicago'
    when 'TN' then 'America/Chicago'
    when 'TX' then 'America/Chicago'
    when 'WI' then 'America/Chicago'
    when 'CO' then 'America/Denver'
    when 'ID' then 'America/Denver'
    when 'MT' then 'America/Denver'
    when 'NM' then 'America/Denver'
    when 'UT' then 'America/Denver'
    when 'WY' then 'America/Denver'
    when 'CA' then 'America/Los_Angeles'
    when 'NV' then 'America/Los_Angeles'
    when 'OR' then 'America/Los_Angeles'
    when 'WA' then 'America/Los_Angeles'
    when 'AZ' then 'America/Phoenix'
    when 'AK' then 'America/Anchorage'
    when 'HI' then 'Pacific/Honolulu'
    else 'UTC'
  end;
$$;

comment on function public.pickup_tz(text) is
  'IANA zone for a US state code (majority side for split states, UTC fallback). Mirrors src/lib/pickup-tz.ts.';

-- ------------------------------------------------------------------
-- Expiry rule with an explicit zone (was: hardcoded Chicago, then
-- database-local). Same three rules, day boundaries in the given zone.
-- ------------------------------------------------------------------
drop function if exists public.ride_expires_at(date, timestamptz, text, text);

create or replace function public.ride_expires_at(
  p_ride_date   date,
  p_created_at  timestamptz,
  p_time_mode   text,
  p_ride_time   text,
  p_tz          text
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    -- ASAP: gone an hour after posting.
    when p_time_mode = 'asap'
      then p_created_at + interval '1 hour'
    -- Anytime: gone at the end of the posting day (poster-local).
    when p_time_mode = 'anytime'
      then (
        date_trunc('day', p_created_at at time zone p_tz)
          + interval '1 day'
          - interval '1 second'
      ) at time zone p_tz
    -- Set time ("5.00 pm" -> gone 6.00 pm): the ride's day at ride_time,
    -- plus one hour. Falls back to the posting day when no ride_date.
    when p_time_mode = 'at'
      and p_ride_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      then (
        (
          coalesce(
            p_ride_date,
            (p_created_at at time zone p_tz)::date
          )
          + p_ride_time::time
        ) at time zone p_tz
      ) + interval '1 hour'
    -- Unreachable fallback (CHECK constraint): the old 7-day rule, so a
    -- surprising row still expires instead of living forever.
    else p_created_at + interval '7 days'
  end;
$$;

comment on function public.ride_expires_at(date, timestamptz, text, text, text) is
  'Post expiry rule keyed on timing + zone: asap +1h, anytime end of posting day, set time +1h on the ride day. Single source of truth.';

create or replace function public.set_ride_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := public.ride_expires_at(
    new.ride_date,
    coalesce(new.created_at, now()),
    new.time_mode,
    new.ride_time,
    public.pickup_tz(new.from_state)
  );
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Conversation auto-delete no longer reads is_future: a dated future
-- ride keeps its chat a day past the ride day, everything else gets
-- now + 24h (same outcomes, date-driven).
-- ------------------------------------------------------------------
create or replace function public.set_conversation_auto_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_date date;
begin
  if new.auto_delete_at is not null then
    return new;  -- caller supplied an explicit value; respect it
  end if;
  select ride_date into r_date
  from public.rides where id = new.ride_id;

  if r_date is not null and r_date > current_date then
    new.auto_delete_at := (r_date + interval '24 hours')::timestamptz;
  else
    new.auto_delete_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Drop order matters: the rides_with_location view expands r.* and
-- depends on the column, and the create RPC bodies reference it, so the
-- view and both RPCs go BEFORE the column drop (plain DROP would abort
-- with 2BP01 otherwise).
-- ------------------------------------------------------------------
drop view if exists public.rides_with_location;

-- ------------------------------------------------------------------
-- Drop is_future (column + its date coupling constraint).
-- ------------------------------------------------------------------
alter table public.rides drop constraint if exists rides_future_has_date;
alter table public.rides drop column if exists is_future;

-- ------------------------------------------------------------------
-- Recreate both create RPCs without p_is_future (exact drops first,
-- grants re-applied — same pattern as 0015/0016/0021/0022).
-- ------------------------------------------------------------------
drop function if exists public.create_offer_ride(
  text, text, text, text, text, text, text, date, boolean, text
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
    description, ride_date, status, from_airport
  ) values (
    'offer', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date,
    'active', nullif(upper(nullif(trim(p_from_airport), '')), '')
  )
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke all on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, text
) from public;
grant execute on function public.create_offer_ride(
  text, text, text, text, text, text, text, date, text
) to authenticated;

drop function if exists public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, boolean, text, text,
  double precision, double precision
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
    description, ride_date, status,
    distance_meters, from_street, to_street, from_airport,
    pin_lat, pin_lng
  ) values (
    'get', auth.uid(),
    p_from_city, p_from_state, nullif(p_from_zip, ''),
    p_to_city, p_to_state, nullif(p_to_zip, ''),
    nullif(p_description, ''), p_ride_date,
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
  integer, text, date, text, text,
  double precision, double precision
) from public;
grant execute on function public.create_get_ride(
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, double precision,
  integer, text, date, text, text,
  double precision, double precision
) to authenticated;

-- View re-creation (dropped above, before the column drop).
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

-- Recompute every row under the new rule (pickup-local days).
update public.rides
   set expires_at = public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time,
     public.pickup_tz(from_state)
   )
 where expires_at is distinct from public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time,
     public.pickup_tz(from_state)
   );
