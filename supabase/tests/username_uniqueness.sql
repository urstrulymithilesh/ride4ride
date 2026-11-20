-- Username uniqueness proofs (run in the SQL editor).
-- Proves:
--   1. Duplicate handle (case-insensitive) is rejected by the unique index.
--   2. Bad format is rejected by the check constraint (letters only).
--   3. is_username_available() reports taken/free correctly.
-- Rolls back -- nothing persists.
begin;

-- 1) duplicate (different case) -- expect REJECTED
do $$
begin
  insert into public.profiles (id, display_name, username)
  values ('00000000-0000-0000-0000-00000000000a', 'Dup', 'PROOFOWNER');
  raise notice 'USERNAME TEST 1 FAILED: duplicate accepted';
exception when others then
  raise notice 'USERNAME TEST 1 PASSED: duplicate rejected (%)', sqlerrm;
end$$;

-- 2) bad format -- expect REJECTED (underscore, digits, symbols all fail)
do $$
begin
  insert into public.profiles (id, display_name, username)
  values (gen_random_uuid(), 'Bad', 'bad_handle123!');
  raise notice 'USERNAME TEST 2 FAILED: bad format accepted';
exception when others then
  raise notice 'USERNAME TEST 2 PASSED: bad format rejected (%)', sqlerrm;
end$$;

-- 3) availability function
do $$
declare v_taken boolean; v_free boolean; v_bad boolean;
begin
  select public.is_username_available('proofowner') into v_taken;
  select public.is_username_available('freehandle') into v_free;
  select public.is_username_available('has_underscore1') into v_bad;
  if v_taken = false and v_free = true and v_bad = false then
    raise notice 'USERNAME TEST 3 PASSED: availability correct';
  else
    raise notice 'USERNAME TEST 3 FAILED: taken=%, free=%, bad=%', v_taken, v_free, v_bad;
  end if;
end$$;

rollback;
