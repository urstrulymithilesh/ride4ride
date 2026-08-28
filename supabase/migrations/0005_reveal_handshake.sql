-- Ride4Ride — Phase 3.5: address reveal handshake
-- =====================================================================
-- The DB-level enforcement already exists (migration 0002):
--   * ride_locations SELECT policy returns addresses ONLY to the owner or
--     a viewer with an `agreed = true` row in ride_reveals.
--   * ride_reveals triggers force owner_id from the ride and let each party
--     set ONLY its own consent flag (on both insert and update).
--
-- This migration adds:
--   1. set_ride_reveal() — an atomic, RLS-respecting way for a participant
--      to set THEIR OWN agreement for the ride tied to a conversation.
--   2. ride_reveals in the realtime publication, so both sides see the
--      handshake update live (RLS still limits it to the two parties).
-- =====================================================================

create or replace function public.set_ride_reveal(
  p_conversation_id uuid,
  p_agree           boolean
)
returns public.ride_reveals
language plpgsql
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_convo    public.conversations;
  v_owner    uuid;
  v_type     public.ride_type;
  v_viewer   uuid;
  v_existing public.ride_reveals;
  v_result   public.ride_reveals;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- RLS: only a participant can select the conversation.
  select * into v_convo from public.conversations where id = p_conversation_id;
  if v_convo.id is null then
    raise exception 'conversation not found';
  end if;
  if v_convo.ride_id is null then
    raise exception 'conversation is not tied to a ride';
  end if;

  select owner_id, type into v_owner, v_type
  from public.rides where id = v_convo.ride_id;
  if v_owner is null then
    raise exception 'ride not found';
  end if;
  if v_type <> 'get' then
    raise exception 'address reveals apply only to get rides';
  end if;

  -- The viewer is the participant who is not the ride owner.
  if v_convo.participant_one = v_owner then
    v_viewer := v_convo.participant_two;
  elsif v_convo.participant_two = v_owner then
    v_viewer := v_convo.participant_one;
  else
    raise exception 'ride owner is not part of this conversation';
  end if;

  if v_uid <> v_owner and v_uid <> v_viewer then
    raise exception 'not a participant';
  end if;

  select * into v_existing from public.ride_reveals
  where ride_id = v_convo.ride_id and viewer_id = v_viewer;

  if v_existing.id is null then
    -- New handshake row; set only the caller's flag. The insert trigger
    -- sets owner_id and independently forces the counterparty flag false.
    insert into public.ride_reveals (ride_id, viewer_id, owner_agreed, viewer_agreed)
    values (
      v_convo.ride_id,
      v_viewer,
      case when v_uid = v_owner  then p_agree else false end,
      case when v_uid = v_viewer then p_agree else false end
    )
    returning * into v_result;
  else
    -- Update only the caller's own flag (the guard trigger enforces this too).
    update public.ride_reveals
    set owner_agreed  = case when v_uid = v_owner  then p_agree else owner_agreed end,
        viewer_agreed = case when v_uid = v_viewer then p_agree else viewer_agreed end
    where id = v_existing.id
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.set_ride_reveal(uuid, boolean) from public;
grant execute on function public.set_ride_reveal(uuid, boolean) to authenticated;

-- Live handshake updates for both parties (RLS-limited).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_reveals'
  ) then
    alter publication supabase_realtime add table public.ride_reveals;
  end if;
end$$;
