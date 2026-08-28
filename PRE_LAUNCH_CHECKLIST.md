# Ride4Ride — Pre-launch checklist

## 🔒 Privacy & security (blocking)
- [ ] All migrations `0001`–`0007` applied to the production database.
- [ ] All three RLS proofs in `supabase/tests/` run green against production.
- [ ] `npm run check:privacy` passes in CI (no address leak paths in code).
- [ ] Verified manually: signed-out and non-revealed users cannot see any
      full address or precise coordinate (browse, post page, API).
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` are set
      as **secrets** (no `NEXT_PUBLIC_` prefix) and not committed.
- [ ] RLS is **enabled** on every table (profiles, rides, ride_locations,
      ride_reveals, conversations, messages, blocks, reports,
      push_subscriptions, allowed_email_domains).
- [ ] Column lockdown verified: a normal user cannot set `verification`,
      `is_admin`, or `is_banned`.
- [ ] Cron routes reject requests without the correct `CRON_SECRET`.

## ✅ Core functionality
- [ ] Sign up (.edu) → email confirmation → verified badge.
- [ ] Sign in / out; protected pages redirect or prompt when signed out.
- [ ] Offer a ride and Get a ride post successfully; distance computes.
- [ ] Browse: Current/Future tabs, City/State/ZIP filters, sort — all work.
- [ ] Copy-link produces a shareable public URL.
- [ ] 1:1 chat: text + image send, realtime delivery, newest-first list.
- [ ] Reveal handshake reveals addresses only after both agree.
- [ ] Report, block (messaging blocked after), and `/admin` takedown/ban.
- [ ] Repost re-publishes an expired post with a fresh expiry.

## ⏰ Scheduled jobs
- [ ] `expire-rides` and `purge-chats` crons registered (Vercel Pro or
      external scheduler if on Hobby).
- [ ] Pre-expiry push received by the owner; expired posts flip to `expired`.
- [ ] Expired chats + their storage images are deleted on schedule.

## 🔔 Notifications
- [ ] VAPID keys set; service worker (`/sw.js`) loads; permission prompt works.
- [ ] A test push is delivered and the click opens the right page.

## 🌐 Domain & config
- [ ] `ride4ride.com` + `www` resolve to Vercel with valid TLS.
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://ride4ride.com`.
- [ ] Supabase Auth Site URL + redirect allow-list include the prod domain.
- [ ] At least one admin account (`profiles.is_admin = true`).

## 📄 Legal & content
- [ ] **Terms of Service and Privacy Policy reviewed by a lawyer** and dated
      (the in-app pages are placeholders — replace before launch).
- [ ] Support/abuse contact emails (legal@, privacy@, admin@) route somewhere.

## 🧭 UX / accessibility
- [ ] Loading, empty, and error states appear where expected.
- [ ] Keyboard navigation + visible focus; skip-to-content link works.
- [ ] Mobile layout checked on a real phone (375px) for key pages.

## 📈 Ops
- [ ] Error monitoring wired into `app/error.tsx` (e.g. Sentry).
- [ ] Database backups enabled in Supabase.
- [ ] Rate limiting / abuse plan considered for auth, posting, messaging.
