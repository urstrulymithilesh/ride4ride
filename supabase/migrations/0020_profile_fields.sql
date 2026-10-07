-- Ride4Ride — Phase 20: profile details (date of birth + phone)
-- =====================================================================
-- Two nullable columns the profile page now collects. GRANTs in this
-- codebase are column-scoped (see 0017: only display_name + username are
-- updatable), so the new columns need their own grant or owner updates
-- fail. Nothing else changes: row-level ownership is untouched.
-- =====================================================================

alter table public.profiles
  add column if not exists date_of_birth date;

alter table public.profiles
  add column if not exists phone text;

grant update (date_of_birth, phone) on public.profiles to authenticated;
