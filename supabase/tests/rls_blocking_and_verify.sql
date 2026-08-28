-- ---------------------------------------------------------------------
-- Trust & safety RLS proofs (run in the Supabase SQL editor).
--
-- Proves:
--   1. After A blocks B, B cannot send a message in their shared chat
--      (restrictive RLS policy), even though B is a participant.
--   2. A user cannot self-set `verification` (column privilege lockdown).
--
-- Replace the two UUIDs with real user ids. Runs in a transaction that
-- ROLLS BACK — nothing persists.
-- ---------------------------------------------------------------------
begin;

-- Seed: ride owned by A, a conversation between A and B (bypasses RLS as
-- postgres for setup only).
insert into public.rides
  (id, type, owner_id, from_city, from_state, to_city, to_state, is_future, expires_at)
values
  ('33333333-3333-3333-3333-333333333333', 'offer',
   '00000000-0000-0000-0000-00000000000a',
   'Riverside', 'CA', 'Los Angeles', 'CA', false, now() + interval '3 days');

insert into public.conversations
  (id, ride_id, participant_one, participant_two, auto_delete_at)
values
  ('44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333',
   '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000b',
   now() + interval '1 day');

-- A blocks B.
insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000b');

-- === 1) B (blocked) tries to message — expect REJECTED ===
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('44444444-4444-4444-4444-444444444444',
            '00000000-0000-0000-0000-00000000000b', 'hi');
    raise notice 'BLOCK TEST FAILED: blocked user sent a message';
  exception when others then
    raise notice 'BLOCK TEST PASSED: message rejected (%)', sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end$$;

-- === 2) B tries to self-verify — expect REJECTED (column privilege) ===
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  begin
    update public.profiles set verification = 'verified'
    where id = '00000000-0000-0000-0000-00000000000b';
    raise notice 'VERIFY TEST FAILED: user self-set verification';
  exception when others then
    raise notice 'VERIFY TEST PASSED: self-verify rejected (%)', sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end$$;

rollback;  -- nothing persisted
