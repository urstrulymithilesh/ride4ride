-- ---------------------------------------------------------------------
-- Reveal-handshake RLS proof (run in the Supabase SQL editor).
--
-- Proves that a viewer CANNOT self-grant address access, and that addresses
-- appear only after BOTH parties agree via set_ride_reveal().
--
-- Replace the two UUIDs with real user ids (find/replace the literals).
-- Runs in a transaction and ROLLS BACK — nothing persists.
-- ---------------------------------------------------------------------
begin;

-- Seed a 'get' ride (owner = ...a), its addresses, and a conversation with
-- the viewer (...b). Runs as postgres (bypasses RLS) for setup only.
insert into public.rides
  (id, type, owner_id, from_city, from_state, to_city, to_state, is_future, expires_at)
values
  ('11111111-1111-1111-1111-111111111111', 'get',
   '00000000-0000-0000-0000-00000000000a',
   'Riverside', 'CA', 'Los Angeles', 'CA', false, now() + interval '3 days');

insert into public.ride_locations (ride_id, from_address, to_address)
values ('11111111-1111-1111-1111-111111111111',
        '900 University Ave, Riverside CA', '111 S Grand Ave, Los Angeles CA');

insert into public.conversations (id, ride_id, participant_one, participant_two, auto_delete_at)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-00000000000b',   -- viewer
        '00000000-0000-0000-0000-00000000000a',   -- owner
        now() + interval '1 day');

-- === 1) Viewer tries to self-grant by forcing owner_agreed=true (INSERT) ===
-- The insert trigger forces the counterparty flag to false, so agreed stays false.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into public.ride_reveals (ride_id, viewer_id, owner_agreed, viewer_agreed)
values ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-00000000000b', true, true);
select 'after viewer self-grant attempt — agreed should be FALSE:' as check,
       owner_agreed, viewer_agreed, agreed
from public.ride_reveals
where ride_id = '11111111-1111-1111-1111-111111111111';

-- viewer still cannot read addresses (expect 0 rows)
select 'viewer sees addresses after self-grant (expect 0):' as check, count(*) as rows
from public.ride_locations
where ride_id = '11111111-1111-1111-1111-111111111111';
reset role;

-- === 2) Proper handshake via the RPC ===
-- viewer agrees (their own flag)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select set_ride_reveal('22222222-2222-2222-2222-222222222222', true);
reset role;

-- owner agrees (their own flag) -> mutual
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select set_ride_reveal('22222222-2222-2222-2222-222222222222', true);
reset role;

-- viewer can now read the addresses (expect 1 row with full addresses)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select 'viewer sees addresses after mutual agreement (expect 1):' as check,
       from_address, to_address
from public.ride_locations
where ride_id = '11111111-1111-1111-1111-111111111111';
reset role;

rollback;  -- nothing persisted
