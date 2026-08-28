-- Ride4Ride — Phase 1: profiles + auth wiring
--
-- Run this against your Supabase project (SQL editor, or `supabase db push`
-- with the CLI). It creates the profile table, row-level security, and a
-- trigger that auto-creates a profile row whenever a new auth user signs up.

-- ------------------------------------------------------------------
-- Verification status enum (leaves the hook for .edu verification later)
-- ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum (
      'unverified',   -- default; email/password only
      'pending',      -- .edu verification requested (future phase)
      'verified'      -- confirmed student (future phase)
    );
  end if;
end$$;

-- ------------------------------------------------------------------
-- Profiles
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  school        text,                                    -- filled in during .edu verification
  verification  public.verification_status not null default 'unverified',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Public-facing user profile, 1:1 with auth.users.';
comment on column public.profiles.school is 'Set during .edu verification (future phase).';

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Row Level Security
--   * Anyone (even anon) may READ profiles — display names appear on posts.
--   * A user may INSERT/UPDATE only their own row.
--   * `verification` and `school` are intended to be set by a trusted
--     server process later; users can update their own display_name freely.
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------
-- Auto-create a profile when a new auth user is created.
-- display_name comes from the sign-up metadata; falls back to the email
-- local-part so the column is never null.
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
