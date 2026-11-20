-- Ride4Ride — Phase 32: date of birth collected at signup
-- =====================================================================
-- Signup now asks for date of birth (18+ enforced in the app) and passes
-- it as `date_of_birth` in the auth metadata. handle_new_user() carries
-- it onto the profile row in the same transaction.
-- Defensive by necessity: this trigger runs inside account creation, so
-- a bad value must never abort signup — safe_date() returns null for
-- anything that isn't a real calendar date.
-- Replay-safe: CREATE OR REPLACE throughout.
-- =====================================================================

-- 1. Strict date parser: YYYY-MM-DD and a real calendar date, else null.
create or replace function public.safe_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return value::date;
exception
  when others then return null;
end;
$$;

-- 2. Signup trigger, 5th version: 0031 body + date_of_birth from metadata.
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
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'user' || substring(new.id::text from 1 for 8))
  );
  if nullif(trim(new.raw_user_meta_data ->> 'username'), '') is not null then
    v_base := public.normalize_username(new.raw_user_meta_data ->> 'username', v_base);
  end if;

  v_candidate := v_base;
  v_n := 0;
  while exists (select 1 from public.profiles where lower(username) = lower(v_candidate)) loop
    v_n := v_n + 1;
    v_candidate := substring(v_base from 1 for (20 - length(public.letters_for_int(v_n)))) || public.letters_for_int(v_n);
    if v_n > 5000 then
      raise exception 'username allocation failed for base %', v_base;
    end if;
  end loop;

  insert into public.profiles (
    id, display_name, username, date_of_birth, gender, age_confirmed_18, tos_accepted_at, tos_version
  )
  values (
    new.id,
    v_display,
    v_candidate,
    public.safe_date(new.raw_user_meta_data ->> 'date_of_birth'),
    -- Restores the 0029 gender carry that 0031 dropped: garbage never
    -- aborts signup, and the check constraint only ever sees male/female.
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
