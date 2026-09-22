-- Ride4Ride — proof: arrivals de-duplicate, and the visitor hashes are
-- unreachable from the client.
--
-- Run in the Supabase SQL Editor AFTER 0014_arrival_tracking.sql.
-- Every SELECT prints PASS or FAIL. All six must read PASS.
-- Wrapped in a rollback.
-- =====================================================================

begin;

-- ---- 1. A visitor counts ONCE per surface per day -------------------
-- "Unique visits" has to be a property of the schema, not of a counting
-- query someone can later get wrong.
insert into public.arrival_events (surface, visitor_hash, day)
values ('feed', 'visitor-A', current_date)
on conflict do nothing;
insert into public.arrival_events (surface, visitor_hash, day)
values ('feed', 'visitor-A', current_date)
on conflict do nothing;
insert into public.arrival_events (surface, visitor_hash, day)
values ('feed', 'visitor-A', current_date)
on conflict do nothing;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
         as test_1_repeat_visits_collapse_to_one,
       count(*) as rows_stored
  from public.arrival_events
 where visitor_hash = 'visitor-A' and surface = 'feed' and day = current_date;

-- ---- 2. The same visitor on a DIFFERENT surface counts separately ---
insert into public.arrival_events (surface, visitor_hash, day)
values ('post', 'visitor-A', current_date)
on conflict do nothing;

select case when count(*) = 2 then 'PASS' else 'FAIL' end
         as test_2_feed_and_post_counted_separately,
       count(*) as rows_stored
  from public.arrival_events
 where visitor_hash = 'visitor-A' and day = current_date;

-- ---- 3. The same visitor on a different DAY counts again ------------
-- Otherwise the day-3 checkpoint could never move.
insert into public.arrival_events (surface, visitor_hash, day)
values ('feed', 'visitor-A', current_date - 1)
on conflict do nothing;

select case when count(*) = 2 then 'PASS' else 'FAIL' end
         as test_3_new_day_counts_again,
       count(*) as rows_stored
  from public.arrival_events
 where visitor_hash = 'visitor-A' and surface = 'feed';

-- ---- 4. Only the two intended surfaces are accepted ------------------
do $$
begin
  begin
    insert into public.arrival_events (surface, visitor_hash)
    values ('/rides/8f2c-secret-uuid', 'visitor-B');
    raise exception 'FAIL: accepted an arbitrary surface value';
  exception when check_violation then
    null; -- expected: a full path must never become an analytics record
  end;
end$$;

select 'PASS' as test_4_surface_is_constrained_to_feed_or_post;

-- ---- 5. The report excludes the founder ------------------------------
-- The founder hits the board far more than anyone during the pilot, so a
-- gate of >= 40 is meaningless without this.
insert into public.arrival_events (surface, visitor_hash, day)
values ('feed', 'founder-hash', current_date)
on conflict do nothing;

select case
         when (select coalesce(sum(total), 0)
                 from public.arrival_report(current_date - 1, null, array['founder-hash']))
              < (select coalesce(sum(total), 0)
                 from public.arrival_report(current_date - 1, null, array[]::text[]))
           then 'PASS' else 'FAIL' end
    as test_5_report_excludes_given_hashes;

-- ---- 6. Neither anon nor authenticated can read visitor hashes -------
-- RLS is on with NO policies. If this fails, the stored IP hashes are
-- enumerable with the anon key.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon","iss":"supabase"}', true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_6a_anon_cannot_read_arrivals,
       count(*) as rows_visible
  from public.arrival_events;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
  true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_6b_authed_cannot_read_arrivals,
       count(*) as rows_visible
  from public.arrival_events;

reset role;
rollback;
