-- Ride4Ride — Phase 29: profile gender + default avatar signal
-- =====================================================================
-- Sign-up asks Male / Female; the choice is stored on profiles and
-- drives the default Shiba avatar (male = deal-with-it Doge,
-- female = bow Doge). Presentation-only downstream: no RLS change is
-- needed (profiles are already world-readable, and the handle trigger
-- below is SECURITY DEFINER so it writes the new column freely).
--
-- Idempotent: column + constraint guarded, trigger OR REPLACE.
-- =====================================================================

alter table public.profiles add column if not exists gender text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_gender_check'
  ) then
    alter table public.profiles
      add constraint profiles_gender_check
      check (gender is null or gender in ('male', 'female'));
  end if;
end;
$$;

comment on column public.profiles.gender is
  'Signup-declared gender (male/female). Picks the default avatar; null on pre-0029 rows.';

-- handle_new_user(), 4th version: carries gender from signup metadata
-- into profiles. Otherwise identical to the 0017 version (same handle
-- allocation, same TOS/age writes, same ON CONFLICT DO NOTHING).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_base text;
  v_candidate text;
  v_n integer;
begin
  v_display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_base := public.normalize_username(
    new.raw_user_meta_data ->> 'username',
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'user_' || substring(new.id::text from 1 for 8))
  );
  -- If the caller supplied an explicit username, normalize it from that
  -- exact value (not the email) so "Alex_R" becomes "alex_r".
  if nullif(trim(new.raw_user_meta_data ->> 'username'), '') is not null then
    v_base := public.normalize_username(new.raw_user_meta_data ->> 'username', v_base);
  end if;

  v_candidate := v_base;
  v_n := 0;
  while exists (select 1 from public.profiles where lower(username) = v_candidate) loop
    v_n := v_n + 1;
    v_candidate := substring(v_base from 1 for (20 - length(v_n::text) - 1)) || '_' || v_n::text;
    if v_n > 1000 then
      -- practically unreachable; fail loudly rather than loop forever
      raise exception 'username allocation failed for base %', v_base;
    end if;
  end loop;

  insert into public.profiles (
    id, display_name, username, age_confirmed_18, tos_accepted_at, tos_version, gender
  )
  values (
    new.id,
    v_display,
    v_candidate,
    coalesce((new.raw_user_meta_data ->> 'age_confirmed_18')::boolean, false),
    case
      when nullif(trim(new.raw_user_meta_data ->> 'tos_version'), '') is not null
        then now()
      else null
    end,
    nullif(trim(new.raw_user_meta_data ->> 'tos_version'), ''),
    nullif(trim(lower(new.raw_user_meta_data ->> 'gender')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
