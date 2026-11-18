-- Ride4Ride — Phase 27: email allowlist
-- =====================================================================
-- Sign-up is phone-first with an optional email. When an email IS given
-- it must be allow-listed; this syncs the table to exactly the accepted
-- suffixes: gmail, hotmail, outlook, yahoo, icloud, .edu. Matching is
-- suffix-based (is_allowed_student_email), so '.edu' covers every school
-- domain. Idempotent: inserts ignore conflicts, the delete only removes
-- rows outside the set.
-- =====================================================================

insert into public.allowed_email_domains (suffix) values
  ('gmail.com'),
  ('hotmail.com'),
  ('outlook.com'),
  ('yahoo.com'),
  ('icloud.com'),
  ('.edu')
on conflict do nothing;

delete from public.allowed_email_domains
 where suffix not in ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', '.edu');
