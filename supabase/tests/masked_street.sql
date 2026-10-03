-- Ride4Ride — proof: masked streets are public-but-get-only.
--
-- Run in the Supabase SQL Editor AFTER 0015_masked_street.sql.
-- Emits PASS or FAIL per assertion (SELECTs and NOTICEs). Six PASSes,
-- zero FAILs required. Rolls everything back: no rows are kept.
--
-- NOTE on negative tests: a check violation aborts the transaction under
-- psql ON_ERROR_STOP=1, so the must-reject cases run inside DO blocks
-- that catch check_violation and report it as PASS.
-- =====================================================================

begin;

-- ---- 1. Columns exist on rides --------------------------------------
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end
    as test_1_street_columns_exist_on_rides
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rides'
  and column_name in ('from_street', 'to_street');

-- ---- 2. Offer ride with from_street is rejected ----------------------
do $$
begin
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    is_future, status, from_street
  )
  select 'offer', id, 'Chicago', 'IL', 'Aurora', 'IL',
         false, 'active', 'Main St'
  from auth.users limit 1;
  raise notice 'FAIL test_2_offer_rejects_from_street (insert succeeded)';
exception when check_violation then
  raise notice 'PASS test_2_offer_rejects_from_street';
end$$;

-- ---- 3. Offer ride with to_street is rejected ------------------------
do $$
begin
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    is_future, status, to_street
  )
  select 'offer', id, 'Chicago', 'IL', 'Aurora', 'IL',
         false, 'active', 'Lake St'
  from auth.users limit 1;
  raise notice 'FAIL test_3_offer_rejects_to_street (insert succeeded)';
exception when check_violation then
  raise notice 'PASS test_3_offer_rejects_to_street';
end$$;

-- ---- 4. Get ride with streets succeeds and reads back ----------------
with owner as (select id from auth.users limit 1),
ins as (
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    is_future, status, from_street, to_street
  )
  select 'get', owner.id, 'Riverside', 'CA', 'Anaheim', 'CA',
         false, 'active', 'Main St', 'Lake St'
  from owner
  returning id, from_street, to_street
)
select
  case when ins.from_street = 'Main St' and ins.to_street = 'Lake St'
       then 'PASS' else 'FAIL' end
    as test_4_get_streets_round_trip
from ins;

-- ---- 5. create_get_ride RPC accepts the new street params ------------
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end
    as test_5_create_get_ride_has_street_params
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_get_ride'
  and p.pronargs = 18;

-- ---- 6. View exposes the new columns (r.* re-expanded) ---------------
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end
    as test_6_view_exposes_street_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rides_with_location'
  and column_name in ('from_street', 'to_street');

-- Nothing is kept: this proof must not leave rows on a live board.
rollback;
