-- Ride4Ride — Phase 33: self-service email removal
-- =====================================================================
-- Supabase Auth offers no API to detach an email once attached (update
-- calls with null/empty are silently ignored), so removal needs a
-- locked-down RPC. This function touches ONLY the caller's own row
-- (auth.uid()), nulls the address plus its confirmation state and any
-- pending email tokens, and deletes the orphaned email identity so the
-- address can't linger as a ghost login. Phone login is untouched.
-- Refuses to run when the account has no phone (that would strand a
-- password-only account with no credential at all — impossible today
-- since signup requires a phone, but the guard makes it structural).
-- Replay-safe: CREATE OR REPLACE + guarded grants.
-- =====================================================================

create or replace function public.remove_own_email()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from auth.users
    where id = auth.uid() and phone is not null
  ) then
    raise exception 'phone required before email removal';
  end if;

  delete from auth.identities
  where user_id = auth.uid() and provider = 'email';

  update auth.users
  set email = null,
      email_confirmed_at = null,
      confirmation_token = null,
      confirmation_sent_at = null,
      recovery_token = null,
      recovery_sent_at = null,
      email_change = null,
      email_change_token_new = null,
      email_change_sent_at = null
  where id = auth.uid();
end;
$$;

revoke all on function public.remove_own_email() from public, anon;
grant execute on function public.remove_own_email() to authenticated;

comment on function public.remove_own_email() is
  'Self-service email detachment: caller only, phone login preserved.';
