-- Ride4Ride — Phase 10: wanted routes (unserved demand capture)
-- =====================================================================
-- THE PROBLEM THIS SOLVES.
-- "Reach" — the right driver exists but is not in your group — is the one
-- pain the founder could not evidence, because rides that never happened
-- leave no trace. This table gives that trace a place to live: someone
-- searches a route, finds nothing, and says so. Unserved demand becomes a
-- countable row instead of a belief.
--
-- WHY ANONYMOUS INSERTS ARE ALLOWED HERE AND NOWHERE ELSE.
-- Most arrivals tap a link in a group chat and have no account. Requiring
-- signup before the row is written would lose nearly all of them, and the
-- loss would be silent — the count would read near-zero for reasons that
-- have nothing to do with demand. Worse, signup sends a confirmation
-- email, so the user leaves the site entirely and comes back through a
-- different tab; anything held client-side across that hop is gone.
--
-- So the row is written FIRST, with created_by null, and a short-lived
-- httpOnly cookie carries its id. If the user later signs up or signs in,
-- the server claims the row using the service role (see lib/wanted-routes).
--
--   anonymous submit --> row (created_by = null) + cookie(row id)
--                                  |
--                         user signs up / signs in
--                                  |
--                    claimWantedRoutes() [service role]
--                                  |
--                       row.created_by = that user
--
-- ROWS ARE NEVER AUTO-DELETED. An earlier draft said unclaimed rows expire
-- after 7 days. That was wrong and is withdrawn: it would delete exactly
-- the signal the table exists to capture, since most link-tappers never
-- sign up. Seven days is the CLAIM WINDOW (the cookie's lifetime), not the
-- row's. An unclaimed row is still valid evidence of unserved demand. The
-- rows carry no personal identifiers — a city pair, an optional airport
-- code, a date window — so retaining them is low risk.
--
-- NO MATCHING JOB. A nightly matcher was specced and cut: it carries a
-- get/give direction inversion, a date-window overlap rule, a route
-- equality rule over free text, cron wiring, and a matched_at lifecycle,
-- all to deliver a notification that was explicitly "a bonus, not the
-- point". The metric is `select count(*)`. If the pilot proceeds,
-- matching gets specced properly then.
-- =====================================================================

create table if not exists public.wanted_routes (
  id                 uuid primary key default gen_random_uuid(),

  -- Coarse only, same privacy posture as `rides`: no addresses ever.
  from_city          text not null,
  from_state         text not null,
  from_airport       text,                    -- IATA, uppercase, nullable
  to_city            text not null,
  to_state           text not null,
  to_airport         text,                    -- IATA, uppercase, nullable

  -- The window the person was looking in, not a precise time.
  date_window_start  date not null,
  date_window_end    date not null,

  -- Which side they needed: 'get' = wanted a ride, 'give' = had seats.
  role_wanted        public.ride_type not null,

  -- Null until claimed. Never set from the client; see lib/wanted-routes.
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint wanted_routes_window_ordered
    check (date_window_end >= date_window_start),
  constraint wanted_routes_from_airport_iata
    check (from_airport is null or from_airport ~ '^[A-Z]{3}$'),
  constraint wanted_routes_to_airport_iata
    check (to_airport is null or to_airport ~ '^[A-Z]{3}$')
);

comment on table public.wanted_routes is
  'Routes people looked for and did not find. Unserved demand. Anonymous inserts allowed; rows are never auto-deleted.';
comment on column public.wanted_routes.created_by is
  'Null until claimed after signup/sign-in. Claiming is service-role only — there is deliberately no UPDATE policy.';

create index if not exists wanted_routes_created_at_idx
  on public.wanted_routes (created_at desc);
create index if not exists wanted_routes_created_by_idx
  on public.wanted_routes (created_by);

alter table public.wanted_routes enable row level security;

-- INSERT. Two shapes, and only two:
--   anonymous (auth.uid() is null) may insert ONLY unowned rows
--   authenticated may insert ONLY rows owned by themselves
-- Nobody can insert a row owned by someone else.
drop policy if exists "wanted_routes: anon inserts unowned" on public.wanted_routes;
create policy "wanted_routes: anon inserts unowned"
  on public.wanted_routes for insert
  with check (
    ((select auth.uid()) is null and created_by is null)
    or created_by = (select auth.uid())
  );

-- SELECT. Own rows only. The operator count runs through the service role,
-- which bypasses RLS — there is no policy exposing the whole table.
drop policy if exists "wanted_routes: read own" on public.wanted_routes;
create policy "wanted_routes: read own"
  on public.wanted_routes for select
  using (created_by is not null and created_by = (select auth.uid()));

-- NO update policy and NO delete policy, deliberately.
-- Claiming sets created_by and runs as the service role, which bypasses
-- RLS. A client-facing UPDATE policy permissive enough to claim an unowned
-- row would let any authenticated user claim ANY unclaimed row.
