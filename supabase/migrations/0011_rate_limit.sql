-- Ride4Ride — Phase 11: rate limiting for unauthenticated writes
-- =====================================================================
-- 0010 opened the first write endpoint that does not require an account:
-- anonymous wanted_routes inserts. That was a deliberate trade (most
-- arrivals tap a link with no account, and requiring signup first would
-- silently lose the demand signal) but it leaves an open flood vector.
-- One script could fill the table and destroy the metric it exists to
-- produce.
--
-- WHY IN THE DATABASE AND NOT IN PROCESS MEMORY.
-- The obvious `Map` in module scope does not work on Vercel: serverless
-- invocations are spread across instances that share no memory and are
-- recycled constantly, so an in-memory counter would reset unpredictably
-- and never see most of the traffic. It would look like a rate limit and
-- stop almost nothing. Postgres is the only state all instances share.
--
-- WHY A SEPARATE TABLE RATHER THAN A COLUMN ON wanted_routes.
-- wanted_routes is the demand-signal dataset and is documented as holding
-- no identifiers: a city pair, an optional airport code, a date window.
-- Putting a per-submitter hash on it would quietly make every row
-- pseudonymous. Keeping the hashes here means the metric table stays
-- exactly as advertised and the identifiers live somewhere with a short
-- retention and no read path.
--
-- WHAT IS STORED. A salted SHA-256 of the client IP, never the IP itself.
-- Unsalted, an IPv4 hash is trivially reversible (the whole space is
-- 2^32), so the salt is what makes this pseudonymous rather than
-- decorative. See RATE_LIMIT_SALT in .env.local.example.
-- =====================================================================

create table if not exists public.rate_limit_hits (
  id           bigserial primary key,
  bucket       text        not null,   -- which endpoint, e.g. 'wanted_routes'
  subject_hash text        not null,   -- salted sha256 of the client IP
  hit_at       timestamptz not null default now()
);

comment on table public.rate_limit_hits is
  'Short-lived rate-limit counters. Holds a SALTED HASH of the client IP, never the IP. No RLS policies: service role only.';

create index if not exists rate_limit_hits_lookup_idx
  on public.rate_limit_hits (bucket, subject_hash, hit_at desc);

-- RLS on with NO policies at all: nothing reachable by anon or
-- authenticated can read or write this table. The service role bypasses
-- RLS, and rate_limit_take() below is security definer.
alter table public.rate_limit_hits enable row level security;

-- ------------------------------------------------------------------
-- Take one token. Returns true when the caller is still under the limit.
--
-- Insert-then-count rather than count-then-insert: under concurrency the
-- worst case is letting through a couple extra requests, which is the
-- right way to be wrong for a spam control. Count-then-insert can be
-- raced into letting through an unbounded number.
--
-- Expired hits for this subject are cleared on the way in, so the table
-- stays bounded per subject without needing a cron.
-- ------------------------------------------------------------------
create or replace function public.rate_limit_take(
  p_bucket         text,
  p_subject_hash   text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket is null or p_subject_hash is null then
    return false; -- fail closed on a malformed call
  end if;

  delete from public.rate_limit_hits
   where bucket = p_bucket
     and subject_hash = p_subject_hash
     and hit_at < now() - make_interval(secs => p_window_seconds);

  insert into public.rate_limit_hits (bucket, subject_hash)
  values (p_bucket, p_subject_hash);

  select count(*) into v_count
    from public.rate_limit_hits
   where bucket = p_bucket
     and subject_hash = p_subject_hash
     and hit_at > now() - make_interval(secs => p_window_seconds);

  return v_count <= p_limit;
end;
$$;

-- Server-side only. This is never called from the browser.
revoke all on function public.rate_limit_take(text, text, integer, integer) from public;
