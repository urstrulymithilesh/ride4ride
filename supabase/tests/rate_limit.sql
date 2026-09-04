-- Ride4Ride — proof: the rate limiter actually limits, is per-subject and
-- per-bucket, and is unreachable from the client.
--
-- Run in the Supabase SQL Editor AFTER 0011_rate_limit.sql.
-- Every SELECT prints PASS or FAIL. All six must read PASS.
-- Wrapped in a rollback, so it leaves no counters behind.
-- =====================================================================

begin;

-- ---- 1. The first 5 takes are allowed, the 6th is not ---------------
-- LIMITS.wanted_routes in src/lib/rate-limit.ts is 5 per 3600s. If you
-- change it there, change it here: this test is the thing that would
-- otherwise silently stop matching the code.
select
  case when bool_and(allowed) then 'PASS' else 'FAIL' end
    as test_1_first_five_allowed
from (
  select public.rate_limit_take('wanted_routes', 'subject-A', 5, 3600) as allowed
  from generate_series(1, 5)
) t;

select
  case when public.rate_limit_take('wanted_routes', 'subject-A', 5, 3600) = false
       then 'PASS' else 'FAIL' end
    as test_2_sixth_is_refused;

-- ---- 3. A different subject is unaffected ---------------------------
select
  case when public.rate_limit_take('wanted_routes', 'subject-B', 5, 3600) = true
       then 'PASS' else 'FAIL' end
    as test_3_limit_is_per_subject;

-- ---- 4. A different bucket is unaffected ----------------------------
select
  case when public.rate_limit_take('some_other_bucket', 'subject-A', 5, 3600) = true
       then 'PASS' else 'FAIL' end
    as test_4_limit_is_per_bucket;

-- ---- 5. Hits outside the window do not count ------------------------
-- Age subject-A's hits past the window; the next take must be allowed.
update public.rate_limit_hits
   set hit_at = now() - interval '2 hours'
 where bucket = 'wanted_routes' and subject_hash = 'subject-A';

select
  case when public.rate_limit_take('wanted_routes', 'subject-A', 5, 3600) = true
       then 'PASS' else 'FAIL' end
    as test_5_window_expires;

-- ---- 6. Neither anon nor authenticated can read the hashes ----------
-- RLS is on with NO policies, so both roles must see zero rows. If this
-- fails, the stored IP hashes are enumerable by anyone with the anon key.
set local role anon;
select set_config('request.jwt.claims', null, true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_6a_anon_cannot_read_hashes,
       count(*) as rows_visible
  from public.rate_limit_hits;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
  true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_6b_authed_cannot_read_hashes,
       count(*) as rows_visible
  from public.rate_limit_hits;

reset role;
rollback;
