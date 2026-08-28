-- Ride4Ride — Phase 6: chat storage, realtime, conversation RPC
-- =====================================================================
-- Builds on migration 0002 (conversations/messages tables, participant
-- RLS, and the triggers that already set auto_delete_at from the linked
-- ride: current ride -> created_at + 24h, future ride -> ride_date + 24h).
-- =====================================================================

-- ------------------------------------------------------------------
-- Storage bucket for chat images.
--   * private (public = false): objects are reachable only via signed
--     URLs minted for participants, so images are as private as the chat.
--   * allowed_mime_types => SERVER-SIDE enforcement that only images can
--     be uploaded (video/audio/other are rejected by Storage itself).
--   * file_size_limit => 5 MB.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images', 'chat-images', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are keyed as `<conversation_id>/<uuid>.<ext>`. Only the two
-- participants of that conversation may upload/read/delete. We compare
-- conversations.id::text to the first path segment (no uuid cast of the
-- untrusted object name, which would error for non-uuid names).
drop policy if exists "chat images: participants can read" on storage.objects;
create policy "chat images: participants can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.participant_one, c.participant_two)
    )
  );

drop policy if exists "chat images: participants can upload" on storage.objects;
create policy "chat images: participants can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.participant_one, c.participant_two)
    )
  );

drop policy if exists "chat images: participants can delete" on storage.objects;
create policy "chat images: participants can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.participant_one, c.participant_two)
    )
  );

-- ------------------------------------------------------------------
-- Realtime: broadcast message inserts. RLS still applies to realtime
-- postgres_changes, so a client only receives messages from a
-- conversation it participates in.
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end$$;

-- ------------------------------------------------------------------
-- get_or_create_conversation — start (or resume) a 1:1 chat with a
-- ride's owner. SECURITY INVOKER so RLS governs the insert/select and
-- the auto_delete_at trigger fires with the ride's timing.
-- ------------------------------------------------------------------
create or replace function public.get_or_create_conversation(p_ride_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select owner_id into v_owner from public.rides where id = p_ride_id;
  if v_owner is null then
    raise exception 'ride not found';
  end if;
  if v_owner = v_uid then
    raise exception 'you cannot message your own ride';
  end if;

  -- Existing conversation for this ride + unordered participant pair?
  select id into v_id
  from public.conversations
  where ride_id = p_ride_id
    and least(participant_one, participant_two) = least(v_uid, v_owner)
    and greatest(participant_one, participant_two) = greatest(v_uid, v_owner)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (ride_id, participant_one, participant_two)
  values (p_ride_id, v_uid, v_owner)
  returning id into v_id;
  return v_id;

exception when unique_violation then
  -- Lost a race; fetch the row the other insert created.
  select id into v_id
  from public.conversations
  where ride_id = p_ride_id
    and least(participant_one, participant_two) = least(v_uid, v_owner)
    and greatest(participant_one, participant_two) = greatest(v_uid, v_owner)
  limit 1;
  return v_id;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
