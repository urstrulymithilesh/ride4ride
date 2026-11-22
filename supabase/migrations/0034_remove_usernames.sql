-- Ride4Ride — Phase 34: remove usernames completely
-- =====================================================================
-- Profiles are identified by id; the signed-in user's page is
-- ride4ride.com/account. Handles are gone from UI, URLs, and now the DB:
-- drops the username column, its format constraint + unique index, the
-- minting helpers (normalize_username, letters_for_int), and the
-- is_username_available() RPC. Rewrites handle_new_user() without handle
-- allocation (same TOS/age/DOB/gender carries, same ON CONFLICT guard).
-- Replay-safe: guarded drops, CREATE OR REPLACE.
-- =====================================================================

-- 1. Column-scoped grant first: dropping the column would take it anyway,
-- but explicit is honest about what authenticated users may still write
-- (display_name, date_of_birth, phone — granted in 0007/0020).
revoke update (username) on public.profiles from authenticated;

-- 2. Constraint + index.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles drop constraint profiles_username_format;
  end if;
end;
$$;

drop index if exists public.profiles_username_lower_uidx;

-- 3. Minting helpers + availability RPC. Nothing else calls these
-- (verified: only handle_new_user() and the app signup used them).
drop function if exists public.is_username_available(text);
drop function if exists public.normalize_username(text, text);
drop function if exists public.letters_for_int(integer);

-- 4. The column.
alter table public.profiles drop column if exists username;

-- 5. Signup trigger, 6th version: 0032 body minus handle allocation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
begin
  v_display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (
    id, display_name, date_of_birth, gender, age_confirmed_18, tos_accepted_at, tos_version
  )
  values (
    new.id,
    v_display,
    public.safe_date(new.raw_user_meta_data ->> 'date_of_birth'),
    case
      when new.raw_user_meta_data ->> 'gender' in ('male', 'female')
        then new.raw_user_meta_data ->> 'gender'
      else null
    end,
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

comment on column public.profiles.display_name is
  'Chosen display name. No handle: profiles are addressed by id, and the signed-in user lives at /account.';
