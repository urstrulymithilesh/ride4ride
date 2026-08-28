-- Ride4Ride — Phase 2: rides, address privacy, reveals, and chat
-- =====================================================================
-- PRIVACY MODEL (read this first)
-- ---------------------------------------------------------------------
-- Postgres RLS is ROW-level, not COLUMN-level. A SELECT policy chooses
-- which rows are visible; it cannot hide individual columns of a visible
-- row. Therefore the exact addresses / coordinates for 'get' rides are
-- NOT stored on the public `rides` table. They live in a separate table,
-- `ride_locations`, whose RLS returns a row ONLY to:
--     (a) the ride owner, or
--     (b) a counterparty with a mutually-agreed row in `ride_reveals`.
--
-- Public/coarse fields (city, state, zip) and the computed
-- `distance_meters` stay on `rides` and are world-readable for active
-- rides. Because the sensitive data is in a different, row-protected
-- table, an unauthorized caller cannot select it under ANY query — the
-- protection is enforced by the database, not the UI.
--
-- `rides_with_location` (bottom of file) is a security_invoker view that
-- LEFT JOINs the two tables for convenience: authorized callers get the
-- address columns populated, everyone else gets NULLs — all governed by
-- the `ride_locations` RLS, no extra policy required.
--
-- NOTE: `service_role` bypasses RLS by design. Keep that key server-only.
-- =====================================================================

-- ------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ride_type') then
    create type public.ride_type as enum ('offer', 'get');
  end if;
  if not exists (select 1 from pg_type where typname = 'ride_status') then
    create type public.ride_status as enum ('active', 'matched', 'expired', 'cancelled');
  end if;
end$$;

-- ==================================================================
-- rides — PUBLIC / coarse data only. No street addresses here.
-- ==================================================================
create table if not exists public.rides (
  id              uuid primary key default gen_random_uuid(),
  type            public.ride_type   not null,
  owner_id        uuid               not null references auth.users (id) on delete cascade,

  -- Coarse origin/destination (safe to show publicly for both ride types)
  from_city       text not null,
  from_state      text not null,
  from_zip        text,
  to_city         text not null,
  to_state        text not null,
  to_zip          text,

  -- Trip metadata
  ride_date       date,                         -- NULL => "current" / ASAP
  is_future       boolean not null default false,
  description     text,
  status          public.ride_status not null default 'active',
  distance_meters integer,                       -- computed server-side; safe to show
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A future ride must have a date; a current ride must not.
  constraint rides_future_has_date
    check ((is_future and ride_date is not null) or (not is_future and ride_date is null)),
  -- distance is only meaningful for 'get' rides (address -> address)
  constraint rides_distance_only_for_get
    check (distance_meters is null or type = 'get')
);

comment on table public.rides is
  'Public ride posts. Coarse locations only; exact addresses live in ride_locations.';

create index if not exists rides_status_idx        on public.rides (status);
create index if not exists rides_owner_idx         on public.rides (owner_id);
create index if not exists rides_created_idx       on public.rides (created_at desc);
create index if not exists rides_expires_idx       on public.rides (expires_at);
create index if not exists rides_from_geo_idx      on public.rides (from_state, from_city);
create index if not exists rides_from_zip_idx      on public.rides (from_zip);

drop trigger if exists rides_set_updated_at on public.rides;
create trigger rides_set_updated_at
  before update on public.rides
  for each row execute function public.set_updated_at();

-- ==================================================================
-- ride_locations — SENSITIVE. 1:1 with a 'get' ride. Row-protected.
--   owner_id is denormalized from rides (set by trigger) so the RLS
--   policies stay simple and index-friendly.
-- ==================================================================
create table if not exists public.ride_locations (
  ride_id      uuid primary key references public.rides (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  from_address text not null,
  to_address   text not null,
  from_lat     double precision,
  from_lng     double precision,
  to_lat       double precision,
  to_lng       double precision,
  created_at   timestamptz not null default now()
);

comment on table public.ride_locations is
  'SENSITIVE: exact addresses & coordinates. Never exposed except to owner or an agreed reveal.';

create index if not exists ride_locations_owner_idx on public.ride_locations (owner_id);

-- Force owner_id to match the parent ride's owner (prevents spoofing).
create or replace function public.set_ride_location_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_type  public.ride_type;
begin
  select owner_id, type into v_owner, v_type from public.rides where id = new.ride_id;
  if v_owner is null then
    raise exception 'ride % does not exist', new.ride_id;
  end if;
  if v_type <> 'get' then
    raise exception 'ride_locations may only be attached to a ''get'' ride';
  end if;
  new.owner_id := v_owner;   -- always authoritative, ignore client value
  return new;
end;
$$;

drop trigger if exists ride_locations_set_owner on public.ride_locations;
create trigger ride_locations_set_owner
  before insert or update on public.ride_locations
  for each row execute function public.set_ride_location_owner();

-- ==================================================================
-- ride_reveals — mutual agreement that a counterparty may see the
--   full addresses of a ride. Access is granted only when BOTH sides
--   have agreed (agreed = owner_agreed AND viewer_agreed).
-- ==================================================================
create table if not exists public.ride_reveals (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references public.rides (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,  -- set by trigger
  viewer_id     uuid not null references auth.users (id) on delete cascade,  -- the counterparty
  owner_agreed  boolean not null default false,
  viewer_agreed boolean not null default false,
  agreed        boolean generated always as (owner_agreed and viewer_agreed) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ride_reveals_distinct_parties check (owner_id <> viewer_id),
  unique (ride_id, viewer_id)
);

comment on table public.ride_reveals is
  'Consent ledger: full addresses are revealed to viewer_id only when agreed = true.';

create index if not exists ride_reveals_viewer_idx on public.ride_reveals (viewer_id);
create index if not exists ride_reveals_ride_idx   on public.ride_reveals (ride_id);

-- Populate owner_id from the ride, and — critically — allow each party to
-- pre-set ONLY its own consent flag at insert time. Without this, a viewer
-- could insert a row with owner_agreed = true and self-grant address access.
create or replace function public.set_ride_reveal_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  uid     uuid := auth.uid();
begin
  select owner_id into v_owner from public.rides where id = new.ride_id;
  if v_owner is null then
    raise exception 'ride % does not exist', new.ride_id;
  end if;
  new.owner_id := v_owner;
  if new.owner_id = new.viewer_id then
    raise exception 'owner cannot be their own reveal viewer';
  end if;

  -- Force the counterparty's consent to false; you may only speak for yourself.
  if uid = new.viewer_id then
    new.owner_agreed := false;
  elsif uid = new.owner_id then
    new.viewer_agreed := false;
  else
    -- Inserter is neither party (RLS will also reject); deny any consent.
    new.owner_agreed := false;
    new.viewer_agreed := false;
  end if;
  return new;
end;
$$;

drop trigger if exists ride_reveals_set_owner on public.ride_reveals;
create trigger ride_reveals_set_owner
  before insert on public.ride_reveals
  for each row execute function public.set_ride_reveal_owner();

-- On update: keys are immutable, and each party may flip ONLY its own
-- consent flag (owner can't self-approve on the viewer's behalf).
create or replace function public.guard_ride_reveal_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if new.ride_id <> old.ride_id
     or new.owner_id <> old.owner_id
     or new.viewer_id <> old.viewer_id then
    raise exception 'ride_id / owner_id / viewer_id are immutable';
  end if;
  if uid = old.owner_id and new.viewer_agreed <> old.viewer_agreed then
    raise exception 'owner cannot change the viewer''s consent';
  end if;
  if uid = old.viewer_id and new.owner_agreed <> old.owner_agreed then
    raise exception 'viewer cannot change the owner''s consent';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ride_reveals_guard_update on public.ride_reveals;
create trigger ride_reveals_guard_update
  before update on public.ride_reveals
  for each row execute function public.guard_ride_reveal_update();

-- ==================================================================
-- conversations & messages — 1:1 chat, temporary by design.
-- ==================================================================
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  ride_id          uuid references public.rides (id) on delete set null,
  participant_one  uuid not null references auth.users (id) on delete cascade,
  participant_two  uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  -- When the whole chat self-deletes (messages cascade):
  --   current ride  => created_at + 24h
  --   future ride   => ride_date + 24h
  auto_delete_at   timestamptz not null,
  constraint conversations_distinct_participants
    check (participant_one <> participant_two)
);

comment on table public.conversations is
  '1:1 chat. Temporary: purged at auto_delete_at (24h after creation, or 24h after a future ride date).';

-- One conversation per (ride, unordered participant pair).
create unique index if not exists conversations_unique_pair
  on public.conversations (
    ride_id,
    least(participant_one, participant_two),
    greatest(participant_one, participant_two)
  );
create index if not exists conversations_p1_idx        on public.conversations (participant_one);
create index if not exists conversations_p2_idx        on public.conversations (participant_two);
create index if not exists conversations_autodelete_idx on public.conversations (auto_delete_at);

-- Derive auto_delete_at from the linked ride's timing.
create or replace function public.set_conversation_auto_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_is_future boolean;
  r_date      date;
begin
  if new.auto_delete_at is not null then
    return new;  -- caller supplied an explicit value; respect it
  end if;
  select is_future, ride_date into r_is_future, r_date
  from public.rides where id = new.ride_id;

  if r_is_future is true and r_date is not null then
    new.auto_delete_at := (r_date + interval '24 hours')::timestamptz;
  else
    new.auto_delete_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_set_auto_delete on public.conversations;
create trigger conversations_set_auto_delete
  before insert on public.conversations
  for each row execute function public.set_conversation_auto_delete();

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references auth.users (id) on delete cascade,
  body            text,
  image_url       text,          -- images only (enforced in app/storage, not video/audio)
  created_at      timestamptz not null default now(),
  auto_delete_at  timestamptz not null,  -- inherited from the conversation
  -- A message must carry text and/or an image.
  constraint messages_has_content check (body is not null or image_url is not null)
);

comment on column public.messages.image_url is
  'Optional image only. No video/audio/other file types (enforced at upload).';

-- Newest-first reads:
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_autodelete_idx   on public.messages (auto_delete_at);

-- Messages inherit the conversation's auto_delete_at.
create or replace function public.set_message_auto_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auto_delete_at is null then
    select auto_delete_at into new.auto_delete_at
    from public.conversations where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_auto_delete on public.messages;
create trigger messages_set_auto_delete
  before insert on public.messages
  for each row execute function public.set_message_auto_delete();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Every table is deny-by-default once RLS is enabled; only the policies
-- below grant access. auth.uid() is wrapped in (select ...) so the
-- planner evaluates it once per query (Supabase performance guidance).
-- =====================================================================

-- ---- rides -----------------------------------------------------------
alter table public.rides enable row level security;

drop policy if exists "rides: public can read active" on public.rides;
create policy "rides: public can read active"
  on public.rides for select
  using (status = 'active');

drop policy if exists "rides: owner reads own (any status)" on public.rides;
create policy "rides: owner reads own (any status)"
  on public.rides for select
  using ((select auth.uid()) = owner_id);

drop policy if exists "rides: owner inserts own" on public.rides;
create policy "rides: owner inserts own"
  on public.rides for insert
  with check ((select auth.uid()) = owner_id);

drop policy if exists "rides: owner updates own" on public.rides;
create policy "rides: owner updates own"
  on public.rides for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "rides: owner deletes own" on public.rides;
create policy "rides: owner deletes own"
  on public.rides for delete
  using ((select auth.uid()) = owner_id);

-- ---- ride_locations (THE address firewall) ---------------------------
alter table public.ride_locations enable row level security;

-- SELECT: owner, or a counterparty with a mutually-agreed reveal. This is
-- the single gate through which any street address / exact coord is read.
drop policy if exists "locations: owner or agreed reveal can read" on public.ride_locations;
create policy "locations: owner or agreed reveal can read"
  on public.ride_locations for select
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1 from public.ride_reveals r
      where r.ride_id = ride_locations.ride_id
        and r.viewer_id = (select auth.uid())
        and r.agreed = true
    )
  );

-- Only the ride owner may write locations (owner_id is forced by trigger).
drop policy if exists "locations: owner inserts" on public.ride_locations;
create policy "locations: owner inserts"
  on public.ride_locations for insert
  with check ((select auth.uid()) = owner_id);

drop policy if exists "locations: owner updates" on public.ride_locations;
create policy "locations: owner updates"
  on public.ride_locations for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "locations: owner deletes" on public.ride_locations;
create policy "locations: owner deletes"
  on public.ride_locations for delete
  using ((select auth.uid()) = owner_id);

-- ---- ride_reveals ----------------------------------------------------
alter table public.ride_reveals enable row level security;

-- Only the two parties can see/manage their consent row.
drop policy if exists "reveals: parties can read" on public.ride_reveals;
create policy "reveals: parties can read"
  on public.ride_reveals for select
  using ((select auth.uid()) in (owner_id, viewer_id));

-- Either party may open the reveal (owner_id is forced from the ride by
-- trigger; the WITH CHECK confirms the inserter is actually a party).
drop policy if exists "reveals: a party can create" on public.ride_reveals;
create policy "reveals: a party can create"
  on public.ride_reveals for insert
  with check ((select auth.uid()) in (owner_id, viewer_id));

-- Either party may update (the guard trigger restricts WHAT they can change).
drop policy if exists "reveals: parties can update" on public.ride_reveals;
create policy "reveals: parties can update"
  on public.ride_reveals for update
  using ((select auth.uid()) in (owner_id, viewer_id))
  with check ((select auth.uid()) in (owner_id, viewer_id));

drop policy if exists "reveals: parties can delete" on public.ride_reveals;
create policy "reveals: parties can delete"
  on public.ride_reveals for delete
  using ((select auth.uid()) in (owner_id, viewer_id));

-- ---- conversations ---------------------------------------------------
alter table public.conversations enable row level security;

drop policy if exists "conversations: participants read" on public.conversations;
create policy "conversations: participants read"
  on public.conversations for select
  using ((select auth.uid()) in (participant_one, participant_two));

drop policy if exists "conversations: participant creates" on public.conversations;
create policy "conversations: participant creates"
  on public.conversations for insert
  with check ((select auth.uid()) in (participant_one, participant_two));

drop policy if exists "conversations: participants delete" on public.conversations;
create policy "conversations: participants delete"
  on public.conversations for delete
  using ((select auth.uid()) in (participant_one, participant_two));
-- (No UPDATE policy: conversations are effectively immutable metadata.)

-- ---- messages --------------------------------------------------------
alter table public.messages enable row level security;

-- Read only messages in a conversation you belong to.
drop policy if exists "messages: participants read" on public.messages;
create policy "messages: participants read"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (select auth.uid()) in (c.participant_one, c.participant_two)
    )
  );

-- Send only as yourself, and only into a conversation you belong to.
drop policy if exists "messages: participant sends as self" on public.messages;
create policy "messages: participant sends as self"
  on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (select auth.uid()) in (c.participant_one, c.participant_two)
    )
  );

-- Sender may delete their own message. (No UPDATE policy: messages are immutable.)
drop policy if exists "messages: sender deletes own" on public.messages;
create policy "messages: sender deletes own"
  on public.messages for delete
  using (sender_id = (select auth.uid()));

-- =====================================================================
-- CONVENIENCE VIEW: rides joined with location, RLS-aware.
-- security_invoker = on  => the view runs with the CALLER's privileges,
-- so ride_locations' RLS still applies. Authorized callers see the
-- address columns; everyone else sees them as NULL (LEFT JOIN).
-- =====================================================================
create or replace view public.rides_with_location
with (security_invoker = on) as
select
  r.*,
  l.from_address,
  l.to_address,
  l.from_lat,
  l.from_lng,
  l.to_lat,
  l.to_lng
from public.rides r
left join public.ride_locations l on l.ride_id = r.id;

comment on view public.rides_with_location is
  'RLS-aware join. Address columns are non-NULL only for the owner or an agreed reveal.';

-- =====================================================================
-- OPTIONAL: scheduled cleanup (temporary chats + ride expiry).
-- Requires the pg_cron extension. Uncomment after enabling it in the
-- Supabase dashboard (Database -> Extensions -> pg_cron).
-- =====================================================================
create or replace function public.purge_expired_chats()
returns void
language sql
security definer
set search_path = public
as $$
  -- messages cascade via FK on conversation delete
  delete from public.conversations where auto_delete_at <= now();
$$;

create or replace function public.expire_stale_rides()
returns void
language sql
security definer
set search_path = public
as $$
  update public.rides
     set status = 'expired'
   where status = 'active'
     and expires_at <= now();
$$;

-- select cron.schedule('purge-expired-chats', '*/15 * * * *', $$select public.purge_expired_chats()$$);
-- select cron.schedule('expire-stale-rides',  '*/15 * * * *', $$select public.expire_stale_rides()$$);
