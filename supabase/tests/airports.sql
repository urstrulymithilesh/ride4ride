-- Ride4Ride — proof: airports resolve by proximity, stay public, stay IATA.
--
-- Run in the Supabase SQL Editor AFTER 0016_airports.sql.
-- Emits PASS or FAIL per assertion (SELECTs and NOTICEs). Six PASSes,
-- zero FAILs required. Rolls everything back: seed rows are NOT kept by
-- this proof (they come from the migration itself on a real database;
-- here they are inserted and rolled back).
--
-- NOTE: nearest_airport() is IMMUTABLE and reads the airports table, so
-- the seed rows must exist inside this transaction for tests 1-3.
-- =====================================================================

begin;

-- Seed inside the proof (rolled back at the end; the migration seeds
-- for real on an actual database).
insert into public.airports (iata, name, lat, lng) values
  ('ORD', 'Chicago O''Hare', 41.9742, -87.9073),
  ('MDW', 'Chicago Midway', 41.7868, -87.7522)
on conflict (iata) do nothing;

-- ---- 1. O'Hare terminal coords resolve to ORD -----------------------
select
  case when public.nearest_airport(41.9742, -87.9073) = 'ORD'
       then 'PASS' else 'FAIL' end
    as test_1_ohare_resolves_ord;

-- ---- 2. Midway coords resolve to MDW --------------------------------
select
  case when public.nearest_airport(41.7868, -87.7522) = 'MDW'
       then 'PASS' else 'FAIL' end
    as test_2_midway_resolves_mdw;

-- ---- 3. Far from every airport resolves to NULL ----------------------
-- Null Island: thousands of km from the nearest seeded airport.
select
  case when public.nearest_airport(0, 0) is null
       then 'PASS' else 'FAIL' end
    as test_3_remote_resolves_null;

-- ---- 4. Malformed IATA on rides is rejected --------------------------
do $$
begin
  insert into public.rides (
    type, owner_id, from_city, from_state, to_city, to_state,
    is_future, status, from_airport
  )
  select 'offer', id, 'Chicago', 'IL', 'Aurora', 'IL',
         false, 'active', 'ohare'
  from auth.users limit 1;
  raise notice 'FAIL test_4_bad_iata_rejected (insert succeeded)';
exception when check_violation then
  raise notice 'PASS test_4_bad_iata_rejected';
end$$;

-- ---- 5. Airports are public-readable (anon sees the seed) ------------
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon', 'iss', 'supabase')::text,
  true);

select
  case when count(*) >= 2 then 'PASS' else 'FAIL' end
    as test_5_anon_reads_airports
from public.airports;

reset role;

-- ---- 6. create_offer_ride takes the airport param --------------------
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end
    as test_6_create_offer_ride_has_airport_param
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_offer_ride'
  and p.pronargs = 10;

-- Nothing is kept: seeds and rows roll back with the proof.
rollback;
