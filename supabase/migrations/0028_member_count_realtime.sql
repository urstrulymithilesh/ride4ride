-- Ride4Ride — Phase 28: live member count
-- =====================================================================
-- The feed's member pill tracks profiles over Realtime (INSERT/DELETE
-- refetch the count client-side), so it moves the moment someone joins
-- or leaves. Idempotent: the guarded DO block is a no-op when profiles
-- is already published. RLS posture unchanged — anon already reads
-- profiles ("profiles are readable by everyone", 0001), which is what
-- authorizes the events.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
