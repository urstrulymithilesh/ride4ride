-- Ride4Ride — proof: timing-based post expiry (migrations 0024/0025).
--
-- Run in the Supabase SQL Editor AFTER 0025_pickup_tz_expiry.sql.
-- Every SELECT below prints PASS or FAIL. All ten must read PASS.
--
-- Rule under proof (day boundaries in the PASSED zone, never the session):
--   asap    -> created_at + 1 hour
--   anytime -> 23:59:59 on the posting day
--   at      -> ride_time + 1 hour on the ride day (ride_date, else posting day)
-- Unknown modes fall back to created_at + 7 days (never break a write).
--
-- This is a pure-SQL proof. It exercises ride_expires_at() directly, then
-- does round trips through the rides table as the table owner to prove the
-- trigger overrides caller input and follows timing changes.
-- =====================================================================

begin;

-- ---- 1. asap expires one hour after posting ---------------------------
select
  case when public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'asap', null, 'America/Chicago')
            = timestamptz '2026-09-01 13:00+00'
       then 'PASS' else 'FAIL' end
    as test_1_asap_expires_one_hour_after_posting,
  public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'asap', null, 'America/Chicago') as actual;

-- ---- 2. anytime expires 23:59:59 on the posting day (winter, CST) -----
-- Posted 2026-01-15 10:00 UTC = 04:00 CST the same day, so expiry is
-- 2026-01-15 23:59:59 CST = 2026-01-16 05:59:59 UTC.
select
  case when public.ride_expires_at(null, timestamptz '2026-01-15 10:00+00', 'anytime', null, 'America/Chicago')
            = timestamptz '2026-01-16 05:59:59+00'
       then 'PASS' else 'FAIL' end
    as test_2_anytime_expires_end_of_posting_day_cst,
  public.ride_expires_at(null, timestamptz '2026-01-15 10:00+00', 'anytime', null, 'America/Chicago') as actual;

-- ---- 3. anytime in summer daylight time (CDT) --------------------------
-- Posted 2026-07-15 10:00 UTC = 05:00 CDT the same day, so expiry is
-- 2026-07-15 23:59:59 CDT = 2026-07-16 04:59:59 UTC.
select
  case when public.ride_expires_at(null, timestamptz '2026-07-15 10:00+00', 'anytime', null, 'America/Chicago')
            = timestamptz '2026-07-16 04:59:59+00'
       then 'PASS' else 'FAIL' end
    as test_3_anytime_expires_end_of_posting_day_cdt,
  public.ride_expires_at(null, timestamptz '2026-07-15 10:00+00', 'anytime', null, 'America/Chicago') as actual;

-- ---- 4. the zone argument (not the session) decides the day -----------
-- Same instant as test 2 in UTC: expiry is 2026-01-15 23:59:59 UTC.
select
  case when public.ride_expires_at(null, timestamptz '2026-01-15 10:00+00', 'anytime', null, 'UTC')
            = timestamptz '2026-01-15 23:59:59+00'
       then 'PASS' else 'FAIL' end
    as test_4_zone_argument_decides_the_day,
  public.ride_expires_at(null, timestamptz '2026-01-15 10:00+00', 'anytime', null, 'UTC') as actual;

-- ---- 5. set time expires one hour after ride_time on the ride date -----
-- 17:00 on 2026-09-10 (CDT) -> gone 18:00 CDT = 23:00 UTC.
select
  case when public.ride_expires_at(date '2026-09-10', timestamptz '2026-09-01 12:00+00', 'at', '17:00', 'America/Chicago')
            = timestamptz '2026-09-10 23:00+00'
       then 'PASS' else 'FAIL' end
    as test_5_set_time_expires_one_hour_after_ride_time,
  public.ride_expires_at(date '2026-09-10', timestamptz '2026-09-01 12:00+00', 'at', '17:00', 'America/Chicago') as actual;

-- ---- 6. set time without a ride date uses the posting day -------------
-- Created 2026-09-01 12:00 UTC (= 07:00 CDT), ride_time 17:00 ->
-- gone 18:00 CDT = 23:00 UTC the same day.
select
  case when public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'at', '17:00', 'America/Chicago')
            = timestamptz '2026-09-01 23:00+00'
       then 'PASS' else 'FAIL' end
    as test_6_set_time_without_date_uses_posting_day,
  public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'at', '17:00', 'America/Chicago') as actual;

-- ---- 7. Unknown modes fall back instead of breaking the write ----------
select
  case when public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'someday', null, 'America/Chicago')
            = timestamptz '2026-09-08 12:00+00'
       then 'PASS' else 'FAIL' end
    as test_7_unknown_mode_falls_back,
  public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00', 'someday', null, 'America/Chicago') as actual;

-- ---- 8. Trigger overrides a caller-supplied expires_at on INSERT -------
-- Insert with a deliberately absurd expiry and confirm it is discarded.
-- Expected expiry is derived from the row's own created_at (+1h, asap
-- default), so the assertion cannot go stale whatever time it runs.
with owner as (select id from auth.users limit 1),
ins as (
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    ride_date, status, expires_at
  )
  select 'offer', owner.id, 'Chicago', 'IL', 'Aurora', 'IL',
         null, 'active',
         timestamptz '2099-01-01 00:00+00'      -- caller tries to live forever
  from owner
  returning id, expires_at, created_at
)
select
  case when ins.expires_at = ins.created_at + interval '1 hour'
       then 'PASS' else 'FAIL' end
    as test_8_insert_ignores_caller_expiry,
  ins.expires_at as actual
from ins;

-- ---- 9. Trigger overrides a direct UPDATE of expires_at ----------------
-- This is the hole repostRide() went through. RLS lets an owner update
-- their own row, so the trigger has to be what stops it.
with target as (
  select id, created_at from public.rides
   where from_city = 'Chicago' and to_city = 'Aurora'
   order by created_at desc limit 1
),
upd as (
  update public.rides r
     set expires_at = timestamptz '2099-01-01 00:00+00'
    from target
   where r.id = target.id
  returning r.expires_at, target.created_at
)
select
  case when upd.expires_at = upd.created_at + interval '1 hour'
       then 'PASS' else 'FAIL' end
    as test_9_update_ignores_caller_expiry,
  upd.expires_at as actual
from upd;

-- ---- 10. Changing the timing moves the expiry with it ------------------
-- Flip the same (Illinois) row to anytime: expiry becomes 23:59:59
-- Chicago time on the day it was posted, whatever time the proof runs.
with target as (
  select id from public.rides
   where from_city = 'Chicago' and to_city = 'Aurora'
   order by created_at desc limit 1
),
upd as (
  update public.rides r
     set time_mode = 'anytime', ride_time = null
    from target
   where r.id = target.id
  returning r.expires_at, r.created_at
)
select
  case when upd.expires_at =
            ((date_trunc('day', upd.created_at at time zone 'America/Chicago')
              + interval '1 day' - interval '1 second')
             at time zone 'America/Chicago')
       then 'PASS' else 'FAIL' end
    as test_10_expiry_follows_the_timing,
  upd.expires_at as actual
from upd;

-- Nothing is kept: this proof must not leave rows on a live board.
rollback;
