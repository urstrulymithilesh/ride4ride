-- Ride4Ride — Phase 17: unique usernames
-- =====================================================================
-- Every user gets a unique, human-readable handle separate from the
-- free-form display_name (which stays non-unique).
--
--   username: 3-20 chars, [a-z0-9_], must start with a letter.
--   Uniqueness is case-insensitive via a unique index on lower(username),
--   so "Alex" and "alex" cannot both exist.
--
-- WHY A SEPARATE COLUMN. display_name is "Alex Rivera" — spaces, mixed
-- case, duplicates expected. Forcing it unique would break existing
-- users and fight real names. username is the "@alex_r123" handle used
-- for mentions/links; display_name stays the friendly label.
--
-- RACE SAFETY. The app pre-checks availability before signUp, but two
-- concurrent signups could still collide. The unique index is the real
-- guarantee; handle_new_user() loops with a numeric suffix so the DB
-- trigger never fails on a collision — it picks the next free handle.
-- =====================================================================

-- 1. Column (nullable first so existing rows survive the ADD).
alter table public.profiles
  add column if not exists username text;

comment on column public.profiles.username is
  'Unique handle, 3-20 chars [a-z0-9_], starts with a letter. Case-insensitive unique. Distinct from free-form display_name.';

-- 2. Normalizer: raw input -> valid handle, or fallback. Never returns
-- invalid text, so the trigger + check constraint can never fight.
create or replace function public.normalize_username(raw text, fallback text)
returns text
language plpgsql
immutable
as $$
declare
  base text;
begin
  base := lower(trim(coalesce(nullif(trim(raw), ''), fallback, 'user')));
  -- slug: anything not a-z/0-9/_ becomes _
  base := regexp_replace(base, '[^a-z0-9_]+', '_', 'g');
  -- trim edge underscores
  base := trim(both '_' from base);
  if base = '' then base := 'user'; end if;
  -- must start with a letter
  if base !~ '^[a-z]' then base := 'user_' || base; end if;
  -- fit base within 20 (suffix loop truncates further as needed)
  base := substring(base from 1 for 20);
  -- pad short handles to the 3-char minimum
  if length(base) < 3 then
    base := rpad(base, 3, '0');
  end if;
  return base;
end;
$$;

-- 3. Backfill existing rows: slug display_name (or id prefix), dedupe.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_n integer;
begin
  for r in select id, display_name from public.profiles where username is null loop
    v_base := public.normalize_username(r.display_name, 'user_' || substring(r.id::text from 1 for 8));
    v_candidate := v_base;
    v_n := 0;
    while exists (select 1 from public.profiles where lower(username) = v_candidate) loop
      v_n := v_n + 1;
      -- keep total <= 20: truncate base to leave room for "_<n>"
      v_candidate := substring(v_base from 1 for (20 - length(v_n::text) - 1)) || '_' || v_n::text;
    end loop;
    update public.profiles set username = v_candidate where id = r.id;
  end loop;
end$$;

-- 4. Constraints (after backfill, so they hold immediately).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username ~ '^[a-z][a-z0-9_]{2,19}$');
  end if;
end$$;

alter table public.profiles alter column username set not null;

drop index if exists profiles_username_lower_uidx;
create unique index profiles_username_lower_uidx
  on public.profiles (lower(username));

-- 5. Availability check for the signup form (anon may call it pre-auth).
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_username ~ '^[a-z][a-z0-9_]{2,19}$'
    and not exists (
      select 1 from public.profiles where lower(username) = lower(p_username)
    );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.normalize_username(text, text) to anon, authenticated;

-- 6. Signup trigger: prefer caller-supplied handle, else email local-part,
-- else id prefix. Loop guarantees uniqueness under concurrency (unique
-- index is the final arbiter; a concurrent winner causes a retry via
-- the loop only for the fallback path — exact user-supplied collisions
-- surface as a unique violation, which the app pre-checks and maps to
-- a friendly "taken" error).
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

-- 7. Let users edit their own handle (privileged columns stay locked).
revoke update on public.profiles from authenticated;
grant update (display_name, username) on public.profiles to authenticated;
