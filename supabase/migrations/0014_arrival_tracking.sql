-- Ride4Ride — Phase 14: arrival tracking
-- =====================================================================
-- THE GAP THIS CLOSES. All three original day-21 gates measured
-- CONVERSION — posts, conversations, wanted-routes — and none measured
-- ARRIVAL. So a zero could mean three different things needing opposite
-- responses:
--
--   nobody ever clicked the link      -> the link is dead; re-share
--   people clicked and bounced        -> the board is the problem
--   people clicked, stayed, no posts  -> no demand; stop
--
-- Without arrivals those are indistinguishable, and the pilot's whole
-- purpose is telling them apart.
--
-- WHAT IS STORED, AND WHAT IS NOT.
-- A salted SHA-256 of the client IP — never the IP — reusing exactly the
-- posture the rate limiter established in 0011. No user agent, no
-- referrer, no path beyond a two-value surface label, no third-party
-- analytics script. The row says "someone reached the board today", and
-- nothing else about who.
--
-- The UNIQUE constraint does the de-duplication: one row per visitor per
-- surface per day, inserted with ON CONFLICT DO NOTHING. "Unique visits"
-- is therefore a property of the schema rather than of a counting query
-- that could drift.
-- =====================================================================

create table if not exists public.arrival_events (
  id           bigserial primary key,
  -- 'feed' = /rides, 'post' = /rides/[id]. Deliberately coarse: a full
  -- path would make a post id, and therefore a person's route, part of an
  -- analytics record.
  surface      text        not null check (surface in ('feed', 'post')),
  visitor_hash text        not null,
  -- Present only when the visitor happens to be signed in. Its one job is
  -- letting the report exclude the founder's own traffic.
  user_id      uuid        references auth.users (id) on delete set null,
  day          date        not null default ((now() at time zone 'utc')::date),
  created_at   timestamptz not null default now(),

  constraint arrival_events_unique_per_day unique (visitor_hash, surface, day)
);

comment on table public.arrival_events is
  'One row per visitor per surface per day. Holds a SALTED HASH of the client IP, never the IP. No user agent, no referrer, no path.';

create index if not exists arrival_events_day_idx
  on public.arrival_events (day desc, surface);

-- RLS on with NO policies: unreachable by anon and authenticated alike.
-- Written by the server with the service role, read only through the
-- reporting function below.
alter table public.arrival_events enable row level security;

-- ------------------------------------------------------------------
-- The day-21 gate and the day-3 checkpoint, as one query.
--
-- p_exclude_hashes exists because the founder cannot otherwise be
-- filtered out when browsing signed out, and will hit the board far more
-- than anyone else during the pilot. Signed-in founder visits are
-- excluded by user id; for signed-out ones, run the report once, take
-- your own hash from arrival_events, and pass it here.
-- ------------------------------------------------------------------
create or replace function public.arrival_report(
  p_since           date        default (now() at time zone 'utc')::date - 21,
  p_exclude_user    uuid        default null,
  p_exclude_hashes  text[]      default '{}'
)
returns table (
  day            date,
  feed_arrivals  bigint,
  post_arrivals  bigint,
  total          bigint
)
language sql
stable
set search_path = public
as $$
  select
    e.day,
    count(*) filter (where e.surface = 'feed') as feed_arrivals,
    count(*) filter (where e.surface = 'post') as post_arrivals,
    count(*)                                   as total
  from public.arrival_events e
  where e.day >= p_since
    and (p_exclude_user is null or e.user_id is distinct from p_exclude_user)
    and not (e.visitor_hash = any(p_exclude_hashes))
  group by e.day
  order by e.day;
$$;

comment on function public.arrival_report(date, uuid, text[]) is
  'Day-21 arrival gate and day-3 checkpoint. Service role only — it reads the visitor-hash table.';

revoke all on function public.arrival_report(date, uuid, text[]) from public;
