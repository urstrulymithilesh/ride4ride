-- Ride4Ride — proof: near-pickup pins are public-but-get-only.
--
-- Run in the Supabase SQL Editor AFTER 0022_pin_points.sql.
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
    as test_1_pin_columns_exist_on_rides
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rides'
  and column_name in ('pin_lat', 'pin_lng');

-- ---- 2. Offer ride with a pin is rejected ---------------------------
do $$
begin
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state, status, pin_lat, pin_lng
  )
  select 'offer', id, 'Chicago', 'IL', 'Aurora', 'IL',
         'active', 41.75, -88.31
  from auth.users limit 1;
  raise notice 'FAIL test_2_offer_rejects_pin (insert succeeded)';
exception when check_violation then
  raise notice 'PASS test_2_offer_rejects_pin';
end$$;

-- ---- 3. Half a pin is rejected --------------------------------------
do $$
begin
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state, status, pin_lat
  )
  select 'get', id, 'Chicago', 'IL', 'Aurora', 'IL',
         'active', 41.75
  from auth.users limit 1;
  raise notice 'FAIL test_3_half_pin_rejected (insert succeeded)';
exception when check_violation then
  raise notice 'PASS test_3_half_pin_rejected';
end$$;

-- ---- 4. Get ride with pin succeeds and reads back -------------------
with owner as (select id from auth.users limit 1),
ins as (
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state, status, pin_lat, pin_lng
  )
  select 'get', owner.id, 'Riverside', 'CA', 'Anaheim', 'CA',
         'active', 33.95, -117.39
  from owner
  returning id, pin_lat, pin_lng
)
select
  case when ins.pin_lat = 33.95 and ins.pin_lng = -117.39
       then 'PASS' else 'FAIL' end
    as test_4_get_pin_round_trip
from ins;

-- ---- 5. create_get_ride RPC accepts the two pin params --------------
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end
    as test_5_create_get_ride_has_pin_params
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_get_ride'
  and p.pronargs = 20;

-- ---- 6. View exposes the new columns (r.* re-expanded) -------------
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end
    as test_6_view_exposes_pin_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'rides_with_location'
  and column_name in ('pin_lat', 'pin_lng');

-- Nothing is kept: this proof must not leave rows on a live board.
rollback;
