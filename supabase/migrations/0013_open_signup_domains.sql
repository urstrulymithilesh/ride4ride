-- Ride4Ride — Phase 13: open signup beyond .edu, retire the student badge
-- =====================================================================
-- TWO CHANGES THAT DEPEND ON EACH OTHER.
--
-- `allowed_email_domains` was doing two jobs at once:
--   1. gating who may sign up          (when EDU_VERIFICATION_MODE=restrict)
--   2. deciding who gets "✓ Verified"  (via verify_current_user_email)
--
-- Because of job 2, adding consumer providers to this table would have
-- stamped every Gmail user as a "Verified student" with school
-- "gmail.com" — false, and corrosive to the one trust signal the product
-- has, on a board where strangers get into cars together.
--
-- Retiring the badge is what makes adding those domains safe. With job 2
-- gone the table has exactly one meaning: WHO MAY SIGN UP. That is the
-- thing that was actually wanted.
--
-- WHY THE BADGE GOES. §3 of the spec removed university scoping, so a
-- "verified student" marker is a leftover from a superseded design. A
-- badge that means "has an email address" is worse than no badge: it
-- still reads as an endorsement.
-- =====================================================================

-- ---- 1. Open signup to mainstream providers alongside .edu ----------
-- Suffix match, so 'gmail.com' also covers nothing else — these are
-- matched with `like '%' || suffix`, i.e. the END of the address.
insert into public.allowed_email_domains (suffix) values
  ('gmail.com'),
  ('outlook.com'),
  ('hotmail.com'),
  ('yahoo.com'),
  ('icloud.com')
on conflict (suffix) do nothing;

comment on table public.allowed_email_domains is
  'Email domains permitted to sign up when EDU_VERIFICATION_MODE=restrict. Since 0013 this is a SIGNUP ALLOWLIST ONLY — it no longer grants any badge.';

-- ---- 2. Retire the student verification badge -----------------------
-- Nothing calls this after 0013: src/app/auth/confirm/route.ts no longer
-- invokes it, and the VerifiedBadge component is deleted. Dropping it
-- stops a security-definer function that writes `verification` and
-- `school` from sitting around with no caller.
drop function if exists public.verify_current_user_email();

-- `profiles.verification` and `profiles.school` are deliberately LEFT IN
-- PLACE. Nothing writes them any more and nothing reads them, so they are
-- inert; dropping them would churn the Profile type and the privacy copy
-- for no functional gain. Revisit if a real identity feature lands, which
-- would want a different shape anyway.
comment on column public.profiles.verification is
  'INERT since 0013. The student badge was retired; nothing writes or reads this. Kept to avoid churning types for no gain.';
comment on column public.profiles.school is
  'INERT since 0013. Was populated by verify_current_user_email(), which is dropped.';

-- is_allowed_student_email() is KEPT: it is the signup gate now, not a
-- badge check. Its name is now slightly wrong; renaming it would break
-- the grant and the call site for cosmetic gain, so it stays for now.
