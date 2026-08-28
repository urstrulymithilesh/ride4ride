-- Ride4Ride — Phase: trust & safety
-- =====================================================================
-- Adds: .edu verification (configurable domains), reports, blocks (RLS-
-- enforced), admin/ban flags, and locks down privileged profile columns
-- so users can't self-verify / self-admin / self-unban.
-- =====================================================================

-- ------------------------------------------------------------------
-- profiles: admin + ban flags (verification/school already exist from 0001)
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin  boolean not null default false,
  add column if not exists is_banned boolean not null default false;

-- LOCK DOWN privileged columns: users may update ONLY their display_name.
-- verification/school/is_admin/is_banned are therefore unreachable via a
-- normal client update; they're set only by SECURITY DEFINER functions
-- (which run as the table owner) or the service role.
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- ==================================================================
-- Configurable allowed email domains for student verification.
-- Admin-editable single source of truth (seeded with '.edu').
-- ==================================================================
create table if not exists public.allowed_email_domains (
  suffix     text primary key,   -- matched against the END of the email, e.g. '.edu', '.ac.uk'
  created_at timestamptz not null default now()
);

insert into public.allowed_email_domains (suffix)
values ('.edu')
on conflict (suffix) do nothing;

alter table public.allowed_email_domains enable row level security;

-- Publicly readable (so sign-up can validate before auth); writes are
-- admin-only (via service role / SQL), so no write policy is defined.
drop policy if exists "allowed domains readable by all" on public.allowed_email_domains;
create policy "allowed domains readable by all"
  on public.allowed_email_domains for select
  using (true);

-- True if the email ends with an allowed suffix (case-insensitive).
create or replace function public.is_allowed_student_email(p_email text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_email_domains d
    where lower(p_email) like '%' || lower(d.suffix)
  );
$$;

grant execute on function public.is_allowed_student_email(text) to anon, authenticated;

-- Verify the CURRENT user: if their email is confirmed and its domain is
-- allowed, mark them a verified student. SECURITY DEFINER so it can write
-- the locked-down columns; re-checks everything so it's safe to expose.
create or replace function public.verify_current_user_email()
returns public.verification_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  if v_confirmed is null then
    return 'unverified';  -- email not confirmed yet
  end if;

  if public.is_allowed_student_email(v_email) then
    update public.profiles
    set verification = 'verified',
        school       = split_part(v_email, '@', 2)
    where id = v_uid;
    return 'verified';
  end if;

  return 'unverified';
end;
$$;

grant execute on function public.verify_current_user_email() to authenticated;

-- ==================================================================
-- Blocks — a user blocks another; enforced in RLS for messaging.
-- ==================================================================
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists "blocks: read own" on public.blocks;
create policy "blocks: read own"
  on public.blocks for select
  using ((select auth.uid()) = blocker_id);

drop policy if exists "blocks: create own" on public.blocks;
create policy "blocks: create own"
  on public.blocks for insert
  with check ((select auth.uid()) = blocker_id);

drop policy if exists "blocks: delete own" on public.blocks;
create policy "blocks: delete own"
  on public.blocks for delete
  using ((select auth.uid()) = blocker_id);

-- Bidirectional block check. SECURITY DEFINER so RLS policies can see a
-- block made in EITHER direction (a user can't normally read a block that
-- someone else created against them).
create or replace function public.block_exists(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

grant execute on function public.block_exists(uuid, uuid) to authenticated;

-- Is a user banned? SECURITY DEFINER so policies can read the flag.
create or replace function public.is_user_banned(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_banned from public.profiles where id = p_uid), false);
$$;

grant execute on function public.is_user_banned(uuid) to authenticated;

-- ------------------------------------------------------------------
-- RESTRICTIVE policies layer extra constraints on top of the existing
-- permissive ones (they are AND-ed): no messaging across a block, and no
-- writes from a banned user.
-- ------------------------------------------------------------------
drop policy if exists "conversations: not blocked/banned" on public.conversations;
create policy "conversations: not blocked/banned"
  on public.conversations as restrictive for insert
  with check (
    not public.block_exists(participant_one, participant_two)
    and not public.is_user_banned((select auth.uid()))
  );

drop policy if exists "messages: not blocked/banned" on public.messages;
create policy "messages: not blocked/banned"
  on public.messages as restrictive for insert
  with check (
    not public.is_user_banned(sender_id)
    and not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.block_exists(c.participant_one, c.participant_two)
    )
  );

drop policy if exists "rides: poster not banned" on public.rides;
create policy "rides: poster not banned"
  on public.rides as restrictive for insert
  with check (not public.is_user_banned(owner_id));

-- ==================================================================
-- Reports — users report a post or a user; stored for admin review.
-- ==================================================================
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references auth.users (id) on delete cascade,
  target_type    text not null check (target_type in ('post', 'user')),
  target_ride_id uuid references public.rides (id) on delete cascade,
  target_user_id uuid references auth.users (id) on delete cascade,
  reason         text not null check (reason in ('spam','harassment','scam','safety','inappropriate','other')),
  details        text,
  status         text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at     timestamptz not null default now(),
  constraint reports_target_present check (
    (target_type = 'post' and target_ride_id is not null) or
    (target_type = 'user' and target_user_id is not null)
  )
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Users may file reports and see their own; admins read/triage via the
-- service role (bypasses RLS), so no broad read policy is exposed here.
drop policy if exists "reports: create own" on public.reports;
create policy "reports: create own"
  on public.reports for insert
  with check ((select auth.uid()) = reporter_id);

drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own"
  on public.reports for select
  using ((select auth.uid()) = reporter_id);
