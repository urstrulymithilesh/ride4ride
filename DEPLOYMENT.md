# Deploying Ride4Ride (Vercel + Supabase)

This guide takes you from an empty Supabase project to `https://ride4ride.com`
live on Vercel.

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Note the region.
2. **Run the migrations in order** (SQL Editor, or `supabase db push` with the
   CLI). They are idempotent:
   ```
   supabase/migrations/0001_init_profiles.sql
   supabase/migrations/0002_rides_chat_privacy.sql
   supabase/migrations/0003_ride_create_rpcs.sql
   supabase/migrations/0004_chat_storage_realtime.sql
   supabase/migrations/0005_reveal_handshake.sql
   supabase/migrations/0006_push_and_expiry.sql
   supabase/migrations/0007_trust_and_safety.sql
   ```
3. **Run the RLS proofs** (edit in two real user UUIDs first) and confirm the
   expected output — these verify the privacy guarantees:
   ```
   supabase/tests/rls_address_privacy.sql        -- addresses hidden from anon / non-revealed
   supabase/tests/rls_reveal_handshake.sql       -- addresses appear only after mutual reveal
   supabase/tests/rls_blocking_and_verify.sql    -- blocked users can't message; no self-verify
   ```
4. **Auth → URL Configuration:** set **Site URL** to `https://ride4ride.com`
   and add redirect URLs: `https://ride4ride.com/auth/confirm` (plus
   `http://localhost:3000/auth/confirm` for local dev).
5. **Auth → Providers → Email:** keep "Confirm email" ON (verification depends
   on it). Customize the confirmation email template if desired.
6. **Storage:** the `chat-images` bucket (private, image-only, 5 MB) is created
   by migration 0004 — no manual step.
7. **Seed config:**
   - Allowed student domains live in `allowed_email_domains` (seeded `.edu`).
     Add more as needed: `insert into allowed_email_domains (suffix) values ('.ac.uk');`
   - Make yourself an admin:
     `update public.profiles set is_admin = true where id = '<your-user-id>';`
8. **(Optional) pg_cron:** only needed if you drive the cleanup from Postgres
   instead of Vercel Cron — see the README "Scheduled jobs" section.

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in a
local `.env.local`, copied from `.env.local.example`). Generate VAPID keys once
with `npx web-push generate-vapid-keys`; generate `CRON_SECRET` with
`openssl rand -hex 32`.

| Variable | Scope | Value / source |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase → Settings → API. Bypasses RLS — server only. |
| `NEXT_PUBLIC_SITE_URL` | Public | `https://ride4ride.com` |
| `EDU_VERIFICATION_MODE` | Server | `restrict` or `badge` |
| `MAPBOX_ACCESS_TOKEN` | **Secret** | Mapbox account (geocoding + directions) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | from `web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | Server | same public key |
| `VAPID_PRIVATE_KEY` | **Secret** | from `web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Server | `mailto:admin@ride4ride.com` |
| `CRON_SECRET` | **Secret** | long random string; Vercel sends it to cron routes |

> Never expose `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, or
> `CRON_SECRET` with a `NEXT_PUBLIC_` prefix.

---

## 3. Deploy to Vercel

1. Push the repo to GitHub/GitLab and **Import** it in Vercel. Framework
   preset: **Next.js** (auto-detected). Build command `next build`.
2. Add all env vars above (Production, Preview, Development as appropriate).
3. Deploy. Vercel registers the crons from `vercel.json`
   (`/api/cron/expire-rides` every 30 min, `/api/cron/purge-chats` hourly).
   > **Plan note:** Vercel **Hobby** runs crons at most once/day. For the
   > 30-min cadence use **Pro**, or trigger the routes from an external
   > scheduler / Supabase pg_cron (see README).

---

## 4. Point ride4ride.com at the deployment

1. In **Vercel → Project → Settings → Domains**, add `ride4ride.com` and
   `www.ride4ride.com`.
2. At your DNS registrar, create:
   - Apex `A` record: `@` → `76.76.21.21` (Vercel's anycast IP), **or** an
     `ALIAS`/`ANAME` to `cname.vercel-dns.com` if your registrar supports it.
   - `CNAME`: `www` → `cname.vercel-dns.com`.
3. Wait for DNS to propagate; Vercel auto-provisions the TLS certificate.
4. Confirm `NEXT_PUBLIC_SITE_URL=https://ride4ride.com` and that the same URL
   is in Supabase Auth → URL Configuration (Site URL + redirect allow-list),
   then redeploy so the value is baked into the client bundle.

---

## 5. Post-deploy smoke test

- Sign up with a `.edu` address → confirm email → see the "Verified" badge.
- Post an Offer ride and a Get ride; confirm distance shows, addresses don't.
- From a second account, message the poster; run the reveal handshake.
- Trigger a cron manually:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://ride4ride.com/api/cron/expire-rides`
- Report + block from the second account; take action in `/admin`.
