-- ---------------------------------------------------------------------
-- Address-privacy RLS proof (run in the Supabase SQL editor).
--
-- Demonstrates that from_address/to_address/lat/lng are unreadable by
-- anon and by a signed-in non-counterparty, and become readable only
-- after a mutually-agreed ride_reveals row exists.
--
-- SETUP: replace the two UUIDs below with two REAL user ids from your
-- project (Authentication -> Users, or `select id, email from auth.users`).
-- Everything runs inside a transaction and is ROLLED BACK — nothing is
-- persisted.
-- ---------------------------------------------------------------------
begin;

-- >>> EDIT THESE TWO LINES <<<
\set owner_id  '00000000-0000-0000-0000-00000000000a'
\set viewer_id '00000000-0000-0000-0000-00000000000b'
-- (In the Supabase editor, \set is unavailable — instead find/replace the
--  two UUIDs literally in the statements below.)

-- Seed a 'get' ride + its sensitive location as the owner (run as postgres,
-- which bypasses RLS for setup only).
with r as (
  insert into public.rides
    (type, owner_id, from_city, from_state, to_city, to_state,
     is_future, distance_meters, expires_at)
  values
    ('get', '00000000-0000-0000-0000-00000000000a',
     'Riverside', 'CA', 'Los Angeles', 'CA',
     false, 92000, now() + interval '3 days')
  returning id
)
insert into public.ride_locations
  (ride_id, from_address, to_address, from_lat, from_lng, to_lat, to_lng)
select id, '900 University Ave, Riverside CA', '111 S Grand Ave, Los Angeles CA',
       33.9737, -117.3281, 34.0553, -118.2500
from r;

-- Helper: latest test ride id
create temporary table _t as
  select id as ride_id from public.rides
  where owner_id = '00000000-0000-0000-0000-00000000000a'
  order by created_at desc limit 1;

-- A temp table is owned by the role that created it (postgres here), and
-- every check below reads it AFTER switching to anon or authenticated.
-- Without this grant the first such read dies with
-- "permission denied for table _t" and the proof never reaches its
-- assertions. That is a scaffolding problem, not a privacy finding: _t
-- holds only a ride id that is already public via the `rides` feed.
grant select on _t to anon, authenticated;

-- === 1) ANON cannot read any address ===
-- `set role anon` alone is not what a real request looks like: PostgREST
-- sets request.jwt.claims from the bearer token, and the anon KEY is itself
-- a JWT carrying {"role":"anon"} with NO "sub". Setting the claims makes
-- this match production. It does not change the result here (anon sees 0
-- either way), but a future policy branching on `auth.uid() is null` would
-- be mis-tested without it — which is exactly what happened in 0010/0012.
set local role anon;
set local request.jwt.claims = '{"role":"anon","iss":"supabase"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_1_anon_sees_no_address_rows,
       count(*) as rows_visible
  from public.ride_locations
 where ride_id = (select ride_id from _t);
reset role;

-- === 2) The non-counterparty (viewer, no reveal yet) cannot read ===
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_2_viewer_sees_nothing_before_reveal,
       count(*) as rows_visible
  from public.ride_locations
 where ride_id = (select ride_id from _t);
-- ...but the public/coarse row IS visible via the view, with NULL addresses:
select case
         when count(*) = 1 and bool_and(from_address is null)
                          and bool_and(from_city is not null)
           then 'PASS' else 'FAIL' end
         as test_3_view_shows_coarse_but_nulls_address,
       count(*) as rows_visible,
       bool_and(from_address is null) as address_is_null
  from public.rides_with_location
 where id = (select ride_id from _t);
reset role;

-- === 3) Establish MUTUAL agreement, then the viewer CAN read ===
-- viewer opens + agrees
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.ride_reveals (ride_id, viewer_id, viewer_agreed)
values ((select ride_id from _t),
        '00000000-0000-0000-0000-00000000000b', true);
reset role;

-- owner agrees
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update public.ride_reveals
   set owner_agreed = true
 where ride_id = (select ride_id from _t)
   and viewer_id = '00000000-0000-0000-0000-00000000000b';
reset role;

-- now the viewer sees the addresses
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
         as test_4_viewer_sees_row_after_mutual_reveal,
       count(*) as rows_visible
  from public.ride_locations
 where ride_id = (select ride_id from _t);
select case
         when bool_and(from_address is not null)
          and bool_and(to_address   is not null)
           then 'PASS' else 'FAIL' end
         as test_5_addresses_readable_after_mutual_reveal,
       bool_and(from_address is not null) as from_address_present
  from public.rides_with_location
 where id = (select ride_id from _t);
reset role;

rollback;  -- nothing persisted
