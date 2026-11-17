-- Ride4Ride — Phase 24: timing-based expiry
-- =====================================================================
-- REPLACES the 0008 rule (7 days after the ride date / 7 days after
-- posting). Posts now live on the rhythm of their timing:
--
--   time_mode 'asap'    -> created_at + 1 hour
--   time_mode 'anytime' -> 23:59:59 on the day of posting
--   time_mode 'at'      -> one hour after the set ride_time, on the
--                          ride's day (ride_date, else the posting day)
--
-- Day boundaries follow the DATABASE timezone (UTC on Supabase) — plain
-- date_trunc/casts, no named zone. If the fleet ever needs the poster's
-- wall clock instead of server-local, the trigger would need a per-post
-- timezone, which nothing stores today.
--
-- Unknown modes or malformed times fall back to created_at + 7 days (the
-- old rule) so the trigger can NEVER break a write. The CHECK constraint
-- from 0019 makes those states unreachable in practice.
--
-- Same architecture as 0008: the rule lives in one function, the BEFORE
-- INSERT OR UPDATE trigger derives expires_at on every write, callers
-- cannot set it. Only the rule itself changes.
-- =====================================================================

-- Signature change (2 args -> 4), so the old shape is dropped first.
drop function if exists public.ride_expires_at(date, timestamptz);

create or replace function public.ride_expires_at(
  p_ride_date   date,
  p_created_at  timestamptz,
  p_time_mode   text,
  p_ride_time   text
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    -- ASAP: gone an hour after posting.
    when p_time_mode = 'asap'
      then p_created_at + interval '1 hour'
    -- Anytime: gone at the end of the posting day (database-local).
    when p_time_mode = 'anytime'
      then date_trunc('day', p_created_at)
        + interval '1 day'
        - interval '1 second'
    -- Set time ("5.00 pm" -> gone 6.00 pm): the ride's day at ride_time,
    -- plus one hour. Falls back to the posting day when no ride_date.
    when p_time_mode = 'at'
      and p_ride_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      then (
        coalesce(p_ride_date, p_created_at::date)
        + p_ride_time::time
      )::timestamptz + interval '1 hour'
    -- Unreachable fallback (CHECK constraint): the old 7-day rule, so a
    -- surprising row still expires instead of living forever.
    else p_created_at + interval '7 days'
  end;
$$;

comment on function public.ride_expires_at(date, timestamptz, text, text) is
  'Post expiry rule keyed on timing: asap +1h, anytime end of posting day, set time +1h on the ride day. Day boundaries follow the database timezone. Single source of truth.';

create or replace function public.set_ride_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := public.ride_expires_at(
    new.ride_date,
    coalesce(new.created_at, now()),
    new.time_mode,
    new.ride_time
  );
  return new;
end;
$$;

-- Recompute every row under the new rule. Posts that already outlived
-- their timing window expire on the next cron pass — that is the policy
-- change taking effect, not data loss.
update public.rides
   set expires_at = public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time
   )
 where expires_at is distinct from public.ride_expires_at(
     ride_date, created_at, time_mode, ride_time
   );
