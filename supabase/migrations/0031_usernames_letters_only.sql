-- Ride4Ride — Phase 31: letters-only website-assigned usernames
-- =====================================================================
-- Handles are now fun, auto-assigned, and letters-only:
--   ^[A-Za-z]{3,20}$  (no underscore, no numbers; CamelCase like MidnightRamen)
-- The app mints adjective+noun handles (src/lib/usernames.ts); the DB
-- stays the final arbiter via the case-insensitive unique index.
-- This migration backfills any legacy handle containing _ or digits.
-- Replay-safe: every CREATE has a preceding DROP-IF-EXISTS (see 0012).
-- =====================================================================

-- 1. Letter suffix encoder for collisions: 1->a, 2->b, … 27->aa.
create or replace function public.letters_for_int(n integer)
returns text
language plpgsql
immutable
as $$
declare
  s text := '';
  x integer := n;
  m integer;
begin
  if n is null or n <= 0 then return 'a'; end if;
  while x > 0 loop
    m := (x - 1) % 26;
    s := chr(97 + m) || s;
    x := (x - 1) / 26;
  end loop;
  return s;
end;
$$;

-- 2. Letters-only normalizer (replaces the 0017 version).
-- Preserves case so CamelCase handles survive (MidnightRamen stays).
create or replace function public.normalize_username(raw text, fallback text)
returns text
language plpgsql
immutable
as $$
declare
  base text;
begin
  base := trim(coalesce(nullif(trim(raw), ''), fallback, 'User'));
  -- keep letters only
  base := regexp_replace(base, '[^A-Za-z]+', '', 'g');
  if base = '' or base is null then base := 'User'; end if;
  base := substring(base from 1 for 20);
  if length(base) < 3 then
    base := rpad(base, 3, 'a');
  end if;
  return base;
end;
$$;

-- 3. Backfill legacy handles (those with _ or digits) to letters-only.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_n integer;
begin
  for r in select id, username from public.profiles where username !~ '^[A-Za-z]{3,20}$' loop
    v_base := public.normalize_username(r.username, 'User');
    v_candidate := v_base;
    v_n := 0;
    while exists (select 1 from public.profiles where lower(username) = lower(v_candidate) and id <> r.id) loop
      v_n := v_n + 1;
      v_candidate := substring(v_base from 1 for (20 - length(public.letters_for_int(v_n)))) || public.letters_for_int(v_n);
      if v_n > 5000 then
        raise exception 'username backfill failed for base %', v_base;
      end if;
    end loop;
    update public.profiles set username = v_candidate where id = r.id;
  end loop;
end$$;

-- 4. Replace the format check with letters-only.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles drop constraint profiles_username_format;
  end if;
  alter table public.profiles
    add constraint profiles_username_format
    check (username ~ '^[A-Za-z]{3,20}$');
end$$;

-- 5. Letters-only availability check.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_username ~ '^[A-Za-z]{3,20}$'
    and not exists (
      select 1 from public.profiles where lower(username) = lower(p_username)
    );
$$;

-- 6. Signup trigger: prefer caller-supplied letters-only handle, else mint
-- from display_name/email; collisions get a letter suffix (no _ or digits).
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
    id, display_name, username, age_confirmed_18, tos_accepted_at, tos_version
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
    nullif(trim(new.raw_user_meta_data ->> 'tos_version'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
