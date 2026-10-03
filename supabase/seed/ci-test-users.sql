-- Ride4Ride -- deterministic test users for the SQL proofs
-- LOCAL AND CI ONLY. Never run this against the production project.
-- Inserting into auth.users fires handle_new_user(), so each user also
-- gets a profiles row.

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
   now() - interval '2 minutes', now() - interval '2 minutes',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Proof Owner","username":"proof_owner"}'::jsonb),

  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-00000000000b',
   'authenticated', 'authenticated', 'proof-viewer@ride4ride.test',
   crypt('ci-only-not-a-real-password', gen_salt('bf')), now(),
   now() - interval '1 minute', now() - interval '1 minute',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Proof Viewer","username":"proof_viewer"}'::jsonb)
on conflict (id) do nothing;

do $$
declare v_count integer;
begin
  select count(*) into v_count from auth.users;
  if v_count <> 2 then
    raise exception
      'SEED CHECK FAILED: expected exactly 2 users, found %',
      v_count;
  end if;
end$$;

select 'seed ok: 2 deterministic test users' as status;
