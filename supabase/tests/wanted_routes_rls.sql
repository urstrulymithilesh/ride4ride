-- Ride4Ride — proof: wanted_routes accepts anonymous rows without leaking
-- them, and cannot be claimed from the client.
--
-- Run in the Supabase SQL Editor AFTER 0010_wanted_routes.sql.
-- Every SELECT prints PASS or FAIL. All seven must read PASS.
--
-- Uses set_config('request.jwt.claims') to impersonate roles the way the
-- existing RLS proofs in this directory do. Wrapped in a rollback.
-- =====================================================================

begin;

-- Two real users to act as. If your project has fewer than two confirmed
-- users, create a second one before running this.
create temporary table _actors on commit drop as
  select id, row_number() over (order by created_at) as n
    from auth.users order by created_at limit 2;

-- ---- 1. ANON may insert an unowned row ------------------------------
set local role anon;
select set_config('request.jwt.claims', null, true);

insert into public.wanted_routes (
  from_city, from_state, from_airport, to_city, to_state,
  date_window_start, date_window_end, role_wanted, created_by
) values ('Chicago','IL','ORD','Naperville','IL',
          current_date, current_date + 3, 'get', null);

select 'PASS' as test_1_anon_can_insert_unowned_row;

-- ---- 2. ANON may NOT insert a row owned by someone else --------------
do $$
declare v_owner uuid;
begin
  select id into v_owner from _actors where n = 1;
  begin
    insert into public.wanted_routes (
      from_city, from_state, to_city, to_state,
      date_window_start, date_window_end, role_wanted, created_by
    ) values ('Chicago','IL','Aurora','IL',
              current_date, current_date + 1, 'get', v_owner);
    raise exception 'FAIL: anon inserted a row owned by another user';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS refused it
  end;
end$$;

select 'PASS' as test_2_anon_cannot_insert_owned_row;

-- ---- 3. ANON cannot READ anything, including its own insert ----------
-- The read policy requires created_by = auth.uid(); anon has no uid, so
-- an anonymous submitter cannot enumerate the table afterwards.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_3_anon_reads_nothing,
       count(*) as rows_visible
  from public.wanted_routes;

-- ---- 4. An authenticated user cannot read UNOWNED rows ---------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from _actors where n = 1), 'role', 'authenticated')::text,
  true);

select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_4_authed_cannot_read_unowned,
       count(*) as rows_visible
  from public.wanted_routes
 where created_by is null;

-- ---- 5. An authenticated user CANNOT claim an unowned row ------------
-- There is no UPDATE policy at all, so this must affect zero rows.
-- Without that, any signed-in user could claim any unclaimed row.
with attempt as (
  update public.wanted_routes
     set created_by = (select id from _actors where n = 1)
   where created_by is null
  returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_5_client_cannot_claim,
       count(*) as rows_claimed
  from attempt;

-- ---- 6. A user reads their OWN rows and nobody else's ----------------
reset role;
insert into public.wanted_routes (
  from_city, from_state, to_city, to_state,
  date_window_start, date_window_end, role_wanted, created_by
)
select 'Boston','MA','Cambridge','MA', current_date, current_date + 1, 'get', id
  from _actors where n = 1;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from _actors where n = 2), 'role', 'authenticated')::text,
  true);

select case when count(*) = 0 then 'PASS' else 'FAIL' end
         as test_6_user_cannot_read_another_users_rows,
       count(*) as rows_visible
  from public.wanted_routes;

-- ---- 7. The window-ordering constraint holds -------------------------
reset role;
do $$
begin
  begin
    insert into public.wanted_routes (
      from_city, from_state, to_city, to_state,
      date_window_start, date_window_end, role_wanted
    ) values ('A','IL','B','IL', current_date + 5, current_date, 'get');
    raise exception 'FAIL: accepted a window ending before it starts';
  exception when check_violation then
    null; -- expected
  end;
end$$;

select 'PASS' as test_7_window_must_be_ordered;

rollback;
