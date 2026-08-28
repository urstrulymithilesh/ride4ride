-- Ride4Ride — Phase 5: web push subscriptions + expiry notification marker
-- =====================================================================

-- ------------------------------------------------------------------
-- Per-user web push subscriptions (one row per browser/device endpoint).
-- ------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,   -- client public key (from PushSubscription)
  auth       text not null,   -- client auth secret (from PushSubscription)
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage only their own subscriptions. The cron sender uses the
-- service-role key (bypasses RLS) to read them when pushing.
drop policy if exists "push subs: read own" on public.push_subscriptions;
create policy "push subs: read own"
  on public.push_subscriptions for select
  using ((select auth.uid()) = user_id);

drop policy if exists "push subs: insert own" on public.push_subscriptions;
create policy "push subs: insert own"
  on public.push_subscriptions for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "push subs: update own" on public.push_subscriptions;
create policy "push subs: update own"
  on public.push_subscriptions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push subs: delete own" on public.push_subscriptions;
create policy "push subs: delete own"
  on public.push_subscriptions for delete
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------
-- Marker so the pre-expiry push is sent at most once per ride/expiry.
-- Reset to NULL on repost (new expiry => eligible for a new notice).
-- ------------------------------------------------------------------
alter table public.rides
  add column if not exists expiry_notified_at timestamptz;
