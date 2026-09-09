-- Ride4Ride — deterministic test users for the SQL proofs
-- =====================================================================
-- LOCAL AND CI ONLY. Never run this against the production project.
--
-- The RLS proofs need real rows in auth.users, because rides.owner_id and
-- wanted_routes.created_by are foreign keys to it. Three of them hard-code
-- these two UUIDs; expiry_rule.sql takes `auth.users limit 1` and
-- wanted_routes_rls.sql takes `limit 2`, both of which are only
-- deterministic if these are the ONLY users present.
--
-- That last point matters: run this against a database with other users
-- and those two proofs silently test the wrong accounts. `supabase db
-- reset` gives a fresh database every CI run, so it holds there.
--
-- Inserting into auth.users fires handle_new_user(), so each user also
-- gets a profiles row — which is what we want, since the proofs exercise
-- profile column privileges too.
-- =====================================================================

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-00000000000a',
   'authenticated', 'authenticated', 'proof-owner@ride4ride.test',
   crypt('ci-only-not-a-real-password', gen_salt('bf')), now(),
   -- Staggered so `order by created_at` is stable: owner is always first.
   now() - interval '2 minutes', now() - interval '2 minutes',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Proof Owner"}'::jsonb),

  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-00000000000b',
   'authenticated', 'authenticated', 'proof-viewer@ride4ride.test',
   crypt('ci-only-not-a-real-password', gen_salt('bf')), now(),
   now() - interval '1 minute', now() - interval '1 minute',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Proof Viewer"}'::jsonb)
on conflict (id) do nothing;

-- Fail loudly rather than let the proofs run against a wrong-shaped fixture.
do $$
declare v_count integer;
begin
  select count(*) into v_count from auth.users;
  if v_count <> 2 then
    raise exception
      'SEED CHECK FAILED: expected exactly 2 users, found %. expiry_rule.sql and wanted_routes_rls.sql select users by `limit`, so extra users make them test the wrong accounts.',
      v_count;
  end if;
end$$;

select 'seed ok: 2 deterministic test users' as status;
