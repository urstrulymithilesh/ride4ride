# Ride4Ride

A ride-sharing platform for a student community — [ride4ride.com](https://ride4ride.com).

Two core activities: **Offer a Ride** and **Get a Ride**. Anyone can browse
freely (like Zillow), but must sign in to view post details, contact, message,
post, or publish.

## Tech stack

| Concern      | Choice                                             |
| ------------ | -------------------------------------------------- |
| Framework    | Next.js 16 (App Router) + TypeScript               |
| Styling      | Tailwind CSS                                        |
| Backend      | Supabase — Auth, Postgres, Realtime, Storage       |
| Hosting      | Vercel                                              |

> ⚠️ This project uses **Next.js 16**, which has breaking changes vs. earlier
> versions. See `AGENTS.md` — check `node_modules/next/dist/docs/` before
> writing framework code.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in Supabase keys
npm run dev
```

Open http://localhost:3000.

### Supabase setup (required for auth)

1. Create a Supabase project; copy the URL + anon key into `.env.local`.
2. Run the schema in [`supabase/migrations/0001_init_profiles.sql`](./supabase/migrations/0001_init_profiles.sql)
   (SQL Editor, or `supabase db push`). It creates `profiles`, RLS policies,
   and a trigger that auto-creates a profile on sign-up.
3. **Auth → URL Configuration:** set the Site URL and add
   `http://localhost:3000/auth/confirm` (and the prod equivalent) to the
   redirect allow-list.
4. **Auth → Providers → Email:** the flows work with "Confirm email" either on
   or off — on ⇒ users get a confirmation link (handled by `/auth/confirm`);
   off ⇒ they're signed in immediately after sign-up.

## Environment variables

See [`.env.local.example`](./.env.local.example) for the full list. Summary:

| Variable                        | Public? | Purpose                                        |
| ------------------------------- | ------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes     | Supabase project URL                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes     | Anon key (guarded by Row Level Security)       |
| `SUPABASE_SERVICE_ROLE_KEY`     | **no**  | Server-only; privileged ops, bypasses RLS      |
| `NEXT_PUBLIC_SITE_URL`          | yes     | Auth redirects & copy-link share URLs          |
| `MAPBOX_ACCESS_TOKEN`           | **no**  | Server-only; geocoding + driving distance      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | yes     | Web push subscription (browser)                |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | **no** | Sign web push messages (server)          |
| `VAPID_SUBJECT`                 | **no**  | Contact URI for push services (`mailto:`)      |
| `CRON_SECRET`                   | **no**  | Shared secret authorizing the cron routes      |
| `EDU_VERIFICATION_MODE`         | **no**  | `restrict` (default) or `badge` — see Trust & Safety |

## Privacy guarantee (verification)

The core invariant — no public or non-revealed query can return a full address
or precise coordinate — is protected in three layers:
1. **Schema:** address/coordinate columns live only in the row-protected
   `ride_locations` table; the public `rides` table has none.
2. **Runtime (RLS):** proven by `supabase/tests/rls_address_privacy.sql`,
   `rls_reveal_handshake.sql`, and `rls_blocking_and_verify.sql`.
3. **Static guard:** `npm run check:privacy` fails the build if any code reads
   address columns via the RLS-bypassing service-role client, or selects them
   off the public `rides` table. Run the full gate with `npm run check`.

Deployment steps, env vars, and domain setup: [`DEPLOYMENT.md`](./DEPLOYMENT.md).
Launch gate: [`PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md).

## Trust & safety

- **.edu verification** — configurable. Allowed domains live in the DB table
  `allowed_email_domains` (seeded `.edu`, admin-editable). `EDU_VERIFICATION_MODE`
  = `restrict` (block non-allowed sign-ups) or `badge` (allow all, badge the
  allowed ones). After email confirmation, `verify_current_user_email()`
  (SECURITY DEFINER, re-checks confirmation + domain) upgrades the profile to
  `verified`. Users **cannot** self-verify: `verification`/`school`/`is_admin`/
  `is_banned` are locked by column privilege (users may `UPDATE` only
  `display_name`).
- **Report & block** — users report a post or user (`reports` table, reasons +
  details); users block others (`blocks`). Blocking is enforced in **RLS**:
  restrictive `INSERT` policies on `conversations`/`messages` reject any write
  across a block (checked bidirectionally via SECURITY DEFINER `block_exists`),
  so a blocked user can't start or continue a chat. Banned users can't
  post/message (restrictive policies + `is_user_banned`).
- **Admin** — `/admin` (hidden by `notFound` from non-admins) lists reports and
  lets an admin take down posts (cancel) or ban users. Admin mutations verify
  `is_admin` then act via the service-role client.
- **Safety reminders** — the reveal panel shows a "meet in public first / tell a
  friend" checklist before addresses are shared.
- Proof: [`tests/rls_blocking_and_verify.sql`](./supabase/tests/rls_blocking_and_verify.sql).

## Scheduled jobs (cron)

Two Node route handlers do the time-based work. They're **secured**: each
checks `Authorization: Bearer $CRON_SECRET` and returns 401 otherwise.

| Route | Does | Default schedule |
| --- | --- | --- |
| `/api/cron/expire-rides` | pre-expiry web push (posts expiring within 1h, once each) + flip past-due posts to `expired` | `*/30 * * * *` (every 30 min) |
| `/api/cron/purge-chats` | delete conversations past `auto_delete_at` (messages cascade) + their Storage images | `0 * * * *` (hourly) |

> The pre-expiry notice window is 1h (`PRE_EXPIRY_NOTICE_MS`), so the
> expire-rides job must run **at least** hourly or some posts won't get a
> heads-up before expiring. 30 min gives margin.

### Configure on Vercel (recommended)
1. `crons` are already declared in [`vercel.json`](./vercel.json).
2. Set env vars in the Vercel dashboard (Project → Settings → Environment
   Variables): the Supabase keys, `MAPBOX_ACCESS_TOKEN`, the VAPID keys, and
   `CRON_SECRET`. Vercel automatically sends `CRON_SECRET` as the
   `Authorization: Bearer` header on cron invocations.
3. Deploy. Vercel registers the crons from `vercel.json`.
   > **Plan note:** Vercel **Hobby** limits crons to once per day. For 30-min
   > runs you need **Pro**, or trigger the routes from an external scheduler
   > (below).

### Alternative: Supabase pg_cron (+ pg_net) or external scheduler
The routes are just authenticated HTTP GETs, so anything can drive them:
- **Supabase pg_cron + pg_net** — schedule an HTTP call from Postgres:
  ```sql
  select cron.schedule('expire-rides', '*/30 * * * *', $$
    select net.http_get(
      url    := 'https://ride4ride.com/api/cron/expire-rides',
      headers:= jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
    );
  $$);
  ```
- **External** — cron-job.org / GitHub Actions hitting the URL with the
  `Authorization` header.
- Migration 0002 also ships pure-SQL `purge_expired_chats()` /
  `expire_stale_rides()` you can schedule directly in pg_cron — but those
  **don't** delete Storage images or send push, so the routes are preferred.

## Product spec

### Activities

- **Offer a Ride** — requires only **From City → To City** (no full address).
- **Get a Ride** — requires **From Address → To Address**. Trip distance is
  auto-calculated and shown, but **full addresses are never shown to other
  users** — revealed only to a matched user once both agree to proceed.
- Posts can carry a description/message and be shared via **copy-link**.
- Posts **expire**; the owner gets a push notification before expiry and can
  **one-click repost**.

### Access model

- Public browsing is open to everyone (no account needed).
- Sign-in required to: view post details, contact, message, post, or publish.

### Chat

- 1:1 messaging, **images allowed** (no video/audio/other file types).
- Sorted **newest-first**.
- Temporary by design:
  - **Current rides** — chat auto-deletes **24h after creation**.
  - **Future rides** — chat auto-deletes **24h after the ride date**.

### Filters & sort

- Filter current & future rides by **ZIP**, **City**, or **State**.
- Sort **newest→oldest** or **oldest→newest**.

## Privacy invariant (must-hold)

Get-a-Ride full addresses are **server-only** and must never be serialized to
another user before a mutual match. Enforce at the database, never in the UI.

**How it's enforced (Phase 2):** Postgres RLS is *row*-level, not
*column*-level — a visible row returns all its columns. So the sensitive
fields (`from_address`, `to_address`, exact lat/lng) are **not on `rides`**;
they live in a separate table, `ride_locations`, whose RLS returns a row only
to the ride owner or a counterparty with an `agreed = true` row in
`ride_reveals`. Coarse fields (city/state/zip) and `distance_meters` stay on
the public `rides` table. The `rides_with_location` `security_invoker` view
joins the two so authorized users get addresses and everyone else gets NULLs —
all governed by the same RLS. `service_role` bypasses RLS, so that key must
stay server-only.

## Phased build plan

Scaffolding is done (Phase 0). Features are **not** built yet.

- **Phase 0 — Scaffolding ✅**
  Next.js + TS + Tailwind, Supabase browser/server clients, session
  middleware, folder structure, env template, this README.

- **Phase 1 — Auth & shell ✅**
  Supabase Auth (email/password sign-up / sign-in / sign-out), session-aware
  header, `profiles` table + RLS + auto-create trigger, `requireUser()` gate
  and `<AuthGate>`/`<SignInPrompt>` for protected actions, `.edu` verification
  left as a hook (`isEduEmail`, `verification` column defaulting to
  `unverified`). Rides list/detail are placeholders.

- **Phase 2 — Data model & RLS ✅ (schema)**
  Full Postgres schema + RLS in
  [`0002_rides_chat_privacy.sql`](./supabase/migrations/0002_rides_chat_privacy.sql):
  `rides` (coarse/public), `ride_locations` (sensitive, row-protected),
  `ride_reveals` (mutual-consent ledger), `conversations` + `messages`
  (temporary chat). Address firewall proven by
  [`tests/rls_address_privacy.sql`](./supabase/tests/rls_address_privacy.sql).
  Still to do: posting UI + distance calc (Phase 3).

- **Phase 3 — Posting & distance ✅ (create flows)**
  Offer-a-Ride (city→city) and Get-a-Ride (address→address) forms, current vs.
  future timing + default expiry, server-side Mapbox geocoding + driving
  distance, atomic create via `create_offer_ride`/`create_get_ride` RPCs,
  shareable post page with copy-link. Still to do: edit/repost.

- **Phase 3.5 — Address reveal handshake ✅**
  In-chat mutual-consent handshake: either party requests, the other
  confirms; on mutual agreement a `ride_reveals` row flips `agreed = true`
  and the `ride_locations` RLS lets the two of them (and only them) read the
  addresses. `set_ride_reveal()` RPC sets only the caller's own flag; live via
  Realtime; UI shows "Addresses hidden until both agree" → "Addresses
  revealed." Proof: [`tests/rls_reveal_handshake.sql`](./supabase/tests/rls_reveal_handshake.sql).

- **Phase 4 — Browse, filters, detail ✅**
  Public Zillow-style listings: Current/Future tabs, filters (from
  City/State/ZIP) + sort (newest/oldest) driven by shareable URL search
  params, `RideCard` grid, per-card + per-post copy-link. Detail page shows
  basic info publicly and gates full details/poster/contact behind sign-in.
  Public queries select named columns only — never address fields.

- **Phase 5 — Expiry, notifications & cleanup ✅**
  Vercel Cron routes: `/api/cron/expire-rides` (pre-expiry web push + flip
  past-due posts to `expired`) and `/api/cron/purge-chats` (delete
  conversations past `auto_delete_at` + their Storage images). Web push via
  VAPID (`web-push`), service worker (`public/sw.js`), per-user
  `push_subscriptions`, subscribe route, contextual permission prompt on the
  owner's post. One-click Repost re-publishes an expired post with a fresh
  expiry. See "Scheduled jobs" below.

- **Phase 6 — Chat ✅**
  1:1 realtime messaging (Supabase Realtime), text + image-only messages
  (validated client-side, in the DB check, and by the Storage bucket's
  `allowed_mime_types`), private `chat-images` bucket with per-conversation
  Storage RLS + signed URLs, find-or-create conversation RPC, participant-only
  RLS. Chat/message `auto_delete_at` set by the migration-0002 triggers
  (current → created+24h, future → ride_date+24h). Deletion job = Phase 5.

- **Phase 7 — Polish & deploy**
  Responsive/mobile pass, empty/error states, rate limiting, Vercel deploy,
  domain + auth redirect config for ride4ride.com.

## Project structure

```
src/
  app/                 # App Router routes
    (auth)/            # sign-in, sign-up (route group)
    rides/             # browse + offer/ + get/
    messages/          # chat
    api/               # route handlers
  components/          # ui/, rides/, chat/, layout/
  lib/
    supabase/          # client.ts (browser), server.ts, middleware.ts
    utils/             # helpers
    validations/       # zod/schema validation (added when needed)
  hooks/               # React hooks
  types/               # shared domain types (index.ts); DB types generated later
  proxy.ts             # Next 16 proxy (ex-middleware): refreshes session per request
```
