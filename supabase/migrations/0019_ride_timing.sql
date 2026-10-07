-- Ride4Ride — Phase 19: ride timing (asap / anytime / specific time)
-- =====================================================================
-- Adds two columns the post form now collects:
--   time_mode  'asap' | 'anytime' | 'at'   (default 'asap')
--   ride_time  'HH:MM' 24h, only when time_mode = 'at'
--
-- Deliberately NOT threaded through the create RPCs: those signatures are
-- covered by SQL proofs (masked_street) and grants. Instead the app writes
-- these columns with a follow-up owner UPDATE after the RPC returns the
-- row id. Owner-only update is already the RLS rule, the expiry trigger
-- re-derives the same value on update, and the DEFAULT keeps every code
-- path (including this migration backfilling old rows) in a valid state.
-- =====================================================================

alter table public.rides
  add column if not exists time_mode text not null default 'asap';

alter table public.rides
  add column if not exists ride_time text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rides_time_mode_check'
  ) then
    alter table public.rides
      add constraint rides_time_mode_check
      check (time_mode in ('asap', 'anytime', 'at'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rides_ride_time_check'
  ) then
    alter table public.rides
      add constraint rides_ride_time_check
      check (
        (time_mode = 'at' and ride_time ~ '^[0-2][0-9]:[0-5][0-9]$')
        or (time_mode <> 'at' and ride_time is null)
      );
  end if;
end;
$$;
