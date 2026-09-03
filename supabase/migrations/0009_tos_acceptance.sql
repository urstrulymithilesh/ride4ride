-- Ride4Ride — Phase 9: 18+ attestation and terms acceptance record
-- =====================================================================
-- Before strangers can match with strangers on a public board, two things
-- must be recorded, because neither can be applied retroactively to a ride
-- that has already happened:
--
--   1. the user attested they are 18 or older
--   2. the user accepted the Terms, and WHICH VERSION they accepted
--
-- HONEST SCOPE. This is a terms-of-use artifact, not age assurance. DOB
-- is deferred, so the attestation is an unverified checkbox. It is
-- recorded because having a dated record of what a user agreed to is
-- worth something; it is not a claim that anyone's age was verified.
--
-- WHY THE SIGNUP TRIGGER RATHER THAN A SEPARATE WRITE.
-- `handle_new_user` (0001) already creates the profile row from
-- `raw_user_meta_data ->> 'display_name'`. Routing acceptance through the
-- same metadata means it is written in the SAME transaction as account
-- creation, so an account cannot exist without its acceptance record. A
-- follow-up UPDATE from the app could fail, be skipped, or be interrupted
-- by the email-confirmation round trip, leaving accounts with no record.
--
--   signUp(options.data) --> auth.users.raw_user_meta_data
--                                     |
--                          on_auth_user_created (AFTER INSERT)
--                                     |
--                          handle_new_user() [security definer]
--                                     |
--                       profiles row WITH acceptance, atomically
--
-- Note 0007 does `revoke update on public.profiles from authenticated`
-- and grants only `update (display_name)`, so a signed-in user cannot
-- forge or alter these columns from the client. The security-definer
-- trigger is the only writer.
-- =====================================================================

alter table public.profiles
  add column if not exists age_confirmed_18 boolean     not null default false,
  add column if not exists tos_accepted_at  timestamptz,
  add column if not exists tos_version      text;

comment on column public.profiles.age_confirmed_18 is
  'User attested to being 18+ at signup. Self-declared, NOT verified: DOB is not collected.';
comment on column public.profiles.tos_accepted_at is
  'When the user accepted the Terms. Null for accounts created before 0009.';
comment on column public.profiles.tos_version is
  'Which version of the Terms was accepted, so a later revision can require re-acceptance.';

-- ------------------------------------------------------------------
-- Extend the signup trigger to carry acceptance across from metadata.
-- Unchanged behaviour for display_name; additive only.
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, display_name, age_confirmed_18, tos_accepted_at, tos_version
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    -- Only an explicit 'true' counts. Absent or malformed metadata means
    -- not attested, which is the safe reading.
    coalesce((new.raw_user_meta_data ->> 'age_confirmed_18')::boolean, false),
    case
      when nullif(trim(new.raw_user_meta_data ->> 'tos_version'), '') is not null
        then now()
      else null
    end,
    nullif(trim(new.raw_user_meta_data ->> 'tos_version'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Reporting helper: who has not accepted the current Terms. Used to find
-- accounts predating 0009, and after any Terms revision.
-- ------------------------------------------------------------------
create or replace function public.profiles_missing_tos(p_version text)
returns table (id uuid, display_name text, tos_version text)
language sql
stable
set search_path = public
as $$
  select p.id, p.display_name, p.tos_version
    from public.profiles p
   where p.tos_version is distinct from p_version
      or p.tos_accepted_at is null
      or p.age_confirmed_18 = false;
$$;

revoke all on function public.profiles_missing_tos(text) from public;
-- Service role only: this is an operator report, not a user-facing query.
