-- Ride4Ride — Phase 26: clean re-application of the date-driven model
-- =====================================================================
-- Replaces 0024 + 0025 with a single file that is safe to run over ANY
-- current state: fresh, fully-applied, or half-applied (the 2BP01 abort
-- left the first 0025 attempt split in two — functions new, column and
-- view old).
--
-- Why this instead of re-running 0001-0025: files 0001-0023 are already
-- idempotent and verified, and re-running them buys nothing. Every bug
-- from the earlier attempts lives in exactly three function names, so
-- this file wipes ALL overloads of those three names first (a plain
-- DROP with an exact signature misses siblings and leaves ambiguous
-- overloads behind — that is the failure the red error line was
-- hiding), then rebuilds the one correct shape of each.
--
-- Safe to re-run: every step is IF EXISTS / OR REPLACE / guarded.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. Wipe every overload of the three rebuilt functions. Partial runs
--    leave old-signature siblings (with p_is_future, with p_expires_at,
--    2-arg / 4-arg expiry) that exact-signature DROPs miss; coexisting
--    overloads make the app's RPC call ambiguous or route to the dead
--    shape. Looping pg_proc removes all of them regardless of what is
--    currently there.
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_offer_ride', 'create_get_ride', 'ride_expires_at')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end;
$$;

-- ------------------------------------------------------------------
-- 2. Columns the final RPCs and trigger assume. All IF NOT EXISTS —
--    no-ops when 0019/0021/0022 already applied.
-- ------------------------------------------------------------------
alter table public.rides add column if not exists expiry_notified_at timestamptz;
alter table public.rides add column if not exists time_mode text not null default 'asap';
alter table public.rides add column if not exists ride_time text;
alter table public.rides add column if not exists from_airport text;
alter table public.rides add column if not exists from_street text;
alter table public.rides add column if not exists to_street text;
alter table public.rides add column if not exists pin_lat double precision;
alter table public.rides add column if not exists pin_lng double precision;

-- ------------------------------------------------------------------
-- 3. Retire is_future (the column the app no longer sends or reads).
--    The view expands r.* and depends on it, so it goes first —
--    this ordering is what aborted the first 0025 attempt (2BP01).
-- ------------------------------------------------------------------
drop view if exists public.rides_with_location;
alter table public.rides drop constraint if exists rides_future_has_date;
alter table public.rides drop column if exists is_future;

-- ------------------------------------------------------------------
-- 4. Pickup timezone from the origin state code.
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
-- 5. Expiry rule with an explicit zone. Same three rules, day
--    boundaries in the given zone (never the session):
--      asap    -> created_at + 1 hour
--      anytime -> 23:59:59 on the posting day
--      at      -> ride_time + 1 hour on the ride day (ride_date, else posting day)
--    Unknown modes fall back to created_at + 7 days (never break a write).
-- ------------------------------------------------------------------
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

-- The trigger itself: re-created (not just the function) so a database
-- that somehow lost it gets it back.
drop trigger if exists trg_set_ride_expiry on public.rides;
create trigger trg_set_ride_expiry
  before insert or update on public.rides
  for each row execute function public.set_ride_expiry();

-- ------------------------------------------------------------------
-- 6. Conversation auto-delete keys on the ride date directly
--    (dated future ride -> ride day + 24h, else now + 24h).
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
-- 7. The two create RPCs, final shapes (no p_is_future — the app
--    sends ride_date only). Overloads were wiped in step 1, so these
--    are the only ones left afterwards. Grants re-applied (drops
--    clear them), like every earlier RPC migration.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 8. View re-creation (dropped in step 3, before the column drop).
-- ------------------------------------------------------------------
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
-- 9. Recompute every row under the final rule (pickup-local days).
-- ------------------------------------------------------------------
update public.rides
   set expires_at = public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time,
     public.pickup_tz(from_state)
   )
 where expires_at is distinct from public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time,
     public.pickup_tz(from_state)
   );
