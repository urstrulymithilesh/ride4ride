-- Ride4Ride — Phase 12: fix the anonymous wanted_routes insert policy
-- =====================================================================
-- BUG. 0010's INSERT policy was:
--
--   with check (
--     ((select auth.uid()) is null and created_by is null)
--     or created_by = (select auth.uid())
--   )
--
-- The second branch works: an authenticated user inserting a row owned by
-- themselves succeeds (verified, 201). The FIRST branch does not fire for a
-- real anonymous request, so every anonymous submission was rejected with
-- 42501 "new row violates row-level security policy" — which is the entire
-- point of the feature, since most arrivals have no account.
--
-- Verified against the live API before and after:
--   anon, created_by omitted   -> 401/42501
--   anon, created_by = null    -> 401/42501
--   authed, created_by = self  -> 201
--
-- WHY THE NEW SHAPE IS BETTER, NOT JUST DIFFERENT.
-- The replacement does not ask what auth.uid() is when nobody is signed
-- in. It only asks the question that actually matters:
--
--   with check (created_by is null or created_by = (select auth.uid()))
--
--   anon inserting an unowned row        -> `null is null`            -> allow
--   anon inserting SOMEONE ELSE's row    -> `false or (id = null)`    -> NULL -> deny
--   authed inserting their own row       -> `false or (id = uid)`     -> allow
--   authed inserting SOMEONE ELSE's row  -> `false or (id <> uid)`    -> deny
--
-- The security property that matters is unchanged and still holds:
-- NOBODY can insert a row attributed to another user. What changes is that
-- a signed-in user may also create an UNOWNED row. That is harmless — they
-- would only be denying themselves attribution — and it removes a
-- dependency on how auth.uid() behaves for an unauthenticated request,
-- which is exactly the thing that broke.
-- =====================================================================

drop policy if exists "wanted_routes: anon inserts unowned" on public.wanted_routes;

create policy "wanted_routes: insert unowned or own"
  on public.wanted_routes for insert
  with check (
    created_by is null
    or created_by = (select auth.uid())
  );

comment on table public.wanted_routes is
  'Routes people looked for and did not find. Unserved demand. Anonymous inserts allowed (see 0012); rows are never auto-deleted.';
