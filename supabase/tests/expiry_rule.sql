-- Ride4Ride — proof: post expiry is derived, never caller-supplied.
--
-- Run in the Supabase SQL Editor AFTER 0008_expiry_hardening.sql.
-- Every SELECT below prints PASS or FAIL. All six must read PASS.
--
-- This is a pure-SQL proof of the rule and the trigger. It does not need
-- a real user: it exercises ride_expires_at() directly, then does one
-- round trip through the rides table as the table owner to prove the
-- trigger overrides a supplied value.
-- =====================================================================

begin;

-- ---- 1. Rule: a dated ride expires 7 full days after the ride day ----
select
  case when public.ride_expires_at(date '2026-09-10', timestamptz '2026-09-01 12:00+00')
            = timestamptz '2026-09-18 00:00+00'
       then 'PASS' else 'FAIL' end
    as test_1_dated_ride_expires_7_days_after,
  public.ride_expires_at(date '2026-09-10', timestamptz '2026-09-01 12:00+00') as actual;

-- ---- 2. Rule: an undated (ASAP) ride expires 7 days after creation ---
select
  case when public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00')
            = timestamptz '2026-09-08 12:00+00'
       then 'PASS' else 'FAIL' end
    as test_2_undated_ride_expires_7_days_after_creation,
  public.ride_expires_at(null, timestamptz '2026-09-01 12:00+00') as actual;

-- ---- 3. Rule: posting date does NOT shorten a far-future ride --------
-- The regression this whole migration exists for: a ride booked three
-- weeks out must NOT die seven days after posting.
select
  case when public.ride_expires_at(date '2026-09-22', timestamptz '2026-09-01 12:00+00')
            > timestamptz '2026-09-22 00:00+00'
       then 'PASS' else 'FAIL' end
    as test_3_far_future_ride_outlives_the_ride_date;

-- ---- 4. Trigger overrides a caller-supplied expires_at on INSERT -----
-- Insert with a deliberately absurd expiry and confirm it is discarded.
with owner as (select id from auth.users limit 1),
ins as (
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    ride_date, is_future, status, expires_at
  )
  select 'offer', owner.id, 'Chicago', 'IL', 'Aurora', 'IL',
         date '2026-09-10', true, 'active',
         timestamptz '2099-01-01 00:00+00'      -- caller tries to live forever
  from owner
  returning id, expires_at
)
select
  case when ins.expires_at = timestamptz '2026-09-18 00:00+00'
       then 'PASS' else 'FAIL' end
    as test_4_insert_ignores_caller_expiry,
  ins.expires_at as actual
from ins;

-- ---- 5. Trigger overrides a direct UPDATE of expires_at --------------
-- This is the hole repostRide() went through. RLS lets an owner update
-- their own row, so the trigger has to be what stops it.
with target as (
  select id from public.rides
   where from_city = 'Chicago' and to_city = 'Aurora'
   order by created_at desc limit 1
),
upd as (
  update public.rides r
     set expires_at = timestamptz '2099-01-01 00:00+00'
    from target
   where r.id = target.id
  returning r.expires_at
)
select
  case when upd.expires_at = timestamptz '2026-09-18 00:00+00'
       then 'PASS' else 'FAIL' end
    as test_5_update_ignores_caller_expiry,
  upd.expires_at as actual
from upd;

-- ---- 6. Changing the ride date moves the expiry with it --------------
with target as (
  select id from public.rides
   where from_city = 'Chicago' and to_city = 'Aurora'
   order by created_at desc limit 1
),
upd as (
  update public.rides r
     set ride_date = date '2026-10-01'
    from target
   where r.id = target.id
  returning r.expires_at
)
select
  case when upd.expires_at = timestamptz '2026-10-09 00:00+00'
       then 'PASS' else 'FAIL' end
    as test_6_expiry_follows_the_ride_date,
  upd.expires_at as actual
from upd;

-- Nothing is kept: this proof must not leave rows on a live board.
rollback;
