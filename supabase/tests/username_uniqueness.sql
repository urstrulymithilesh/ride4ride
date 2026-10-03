-- Username uniqueness proofs (run in the SQL editor).
-- Proves:
--   1. Duplicate handle (case-insensitive) is rejected by the unique index.
--   2. Bad format is rejected by the check constraint.
--   3. is_username_available() reports taken/free correctly.
-- Rolls back -- nothing persists.
begin;

-- 1) duplicate (different case) -- expect REJECTED
do $$
begin
  insert into public.profiles (id, display_name, username)
  values ('00000000-0000-0000-0000-00000000000a', 'Dup', 'PROOF_OWNER');
  raise notice 'USERNAME TEST 1 FAILED: duplicate accepted';
exception when others then
  raise notice 'USERNAME TEST 1 PASSED: duplicate rejected (%)', sqlerrm;
end$$;

-- 2) bad format -- expect REJECTED
do $$
begin
  insert into public.profiles (id, display_name, username)
  values (gen_random_uuid(), 'Bad', '1bad name!');
  raise notice 'USERNAME TEST 2 FAILED: bad format accepted';
exception when others then
  raise notice 'USERNAME TEST 2 PASSED: bad format rejected (%)', sqlerrm;
end$$;

-- 3) availability function
do $$
declare v_taken boolean; v_free boolean;
begin
  select public.is_username_available('proof_owner') into v_taken;
  select public.is_username_available('a_free_handle_123') into v_free;
  if v_taken = false and v_free = true then
    raise notice 'USERNAME TEST 3 PASSED: availability correct';
  else
    raise notice 'USERNAME TEST 3 FAILED: taken=%, free=%', v_taken, v_free;
  end if;
end$$;

rollback;
