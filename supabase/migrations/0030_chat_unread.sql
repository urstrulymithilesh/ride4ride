-- Ride4Ride — Phase 30: chat unread tracking for the dock badge
-- =====================================================================
-- conversation_reads records, per (conversation, user), how far they
-- have read. The dock badge counts their conversations' messages from
-- anyone else newer than that mark. Opening a thread upserts the mark
-- (see chat/[id]/page.tsx); RLS keeps every user to their own rows.
--
-- Backfill: existing participants start fully read at migration time so
-- the badge doesn't explode on launch day. New conversations have no
-- row for the recipient until they first open the thread — every
-- incoming message before that correctly counts as unread.
--
-- Idempotent: table/index IF NOT EXISTS, policies drop+create, backfill
-- INSERT ... ON CONFLICT DO NOTHING.
-- =====================================================================

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_reads_user_idx
  on public.conversation_reads (user_id);

alter table public.conversation_reads enable row level security;

drop policy if exists "reads: own rows" on public.conversation_reads;
create policy "reads: own rows"
  on public.conversation_reads
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Everyone caught up on everything so far.
insert into public.conversation_reads (conversation_id, user_id, last_read_at)
select c.id, p.who, now()
  from public.conversations c
  cross join lateral (
    values (c.participant_one), (c.participant_two)
  ) as p(who)
on conflict (conversation_id, user_id) do nothing;

-- Unread total for the caller: their conversations' messages from anyone
-- else newer than their own read mark (no mark yet = everything unread).
-- SECURITY DEFINER, but scoped entirely by auth.uid() — no RLS bypass.
create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    left join public.conversation_reads r
      on r.conversation_id = c.id and r.user_id = auth.uid()
   where (c.participant_one = auth.uid() or c.participant_two = auth.uid())
     and m.sender_id <> auth.uid()
     and m.created_at > coalesce(r.last_read_at, '-infinity');
$$;

revoke all on function public.unread_message_count() from public;
grant execute on function public.unread_message_count() to authenticated;
