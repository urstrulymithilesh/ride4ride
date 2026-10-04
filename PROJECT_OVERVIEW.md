# Ride4Ride — Project Overview

Single reference for: what this is, what the plan is, how it is built, what is done, and what is left.

Sources: `README.md`, `docs/designs/v3-one-route-pilot.md` (approved pilot plan, supersedes v2), `docs/designs/v3-spec-source.md` (older spec vision), `docs/designs/v2-identity-first-increment.md` (superseded), `docs/legal/disclaimer-draft.md`, `PRE_LAUNCH_CHECKLIST.md`, `DEPLOYMENT.md`, `TODOS.md`, migrations `supabase/migrations/0001–0016`, app code in `src/`, CI in `.github/workflows/ci.yml`. Verified 2026-10-03: `npm run check` passes, `npm test` 26/26 green, production serves repo `main` at `https://ride4ride.com`.

---

## 1. What is it

Ride4Ride (`ride4ride.com`) is a **city- and airport-scoped classifieds board for student carpools**, recreating the pattern that already happens in university WhatsApp/Telegram groups: someone posts that they need a ride or are offering one, and the two sides coordinate directly.

It is **discovery and connection only**. Explicitly not a dispatcher, not a payments service, not vetting:

- No payments processed. No price field, no fare estimate, no suggested or capped cost-share anywhere. Money exists only as free text between users (user speech), arranged off-platform.
- Free forever, no take rate, no commission. This is stated as the strongest classification fact and is in the Terms page (`src/app/terms/page.tsx:42`) and the legal draft (`docs/legal/disclaimer-draft.md:30-34`).
- No background checks, licence/insurance verification, or driving-ability vetting. Users evaluate each other; the platform provides report/block tools plus safety reminders.

### The two activities

| | Offer a Ride (`src/app/rides/offer/page.tsx:14`) | Get a Ride |
|---|---|---|
| Input | City → City only, no address needed | Full address → full address (geocoded) |
| Public display | City/state or airport code | Masked coarse fields only (city/state/ZIP); **full addresses never shown publicly** |
| Distance | None, by design (DB constraint `rides_distance_only_for_get` keeps it that way) | Computed server-side via Mapbox and shown |
| Full-address reveal | n/a | Only after mutual consent in chat (see §3) |

Posts carry an optional description/message, are shareable via copy-link (`src/components/rides/copy-link-button.tsx`), and **expire** (owner gets a pre-expiry push and can one-click repost).

### Access model (`src/lib/auth.ts`, enforced in pages)

- **No login:** browsing the feed (`src/app/rides/page.tsx`), viewing an individual post (`src/app/rides/[id]/page.tsx`), sharing a post URL.
- **Login required:** posting, chatting, contact/address reveal, reporting, blocking, submitting a wanted-route.
- This open-discovery choice is deliberate: most arrivals tap a link inside a chat thread on a phone, with no account. Requiring signup before they can see anything would lose them.

### Chat

- 1:1 messaging, text + **images only** (validated client-side, in a DB check, and by the Storage bucket's `allowed_mime_types`).
- Realtime delivery (Supabase Realtime), newest-first list.
- **Temporary by design:** current rides → auto-delete 24h after conversation creation; future rides → auto-delete 24h after the ride date. Deletion (rows cascade + Storage images removed) runs on a schedule.
- **Chat privacy is absolute** (`TODOS.md` P-1, `docs/legal/disclaimer-draft.md:36-40`): nobody except the two participants can ever read contents. Not operators, not analytics, not research. No exceptions, permanently. This already killed one proposed metric (measuring money-talk in chat) — it is off the table forever, not deferred. It is now CI-enforced (see §3).

### Filters and feed

Public Zillow-style listings: Current/Future tabs, filter by from-City/State/ZIP, sort newest→oldest or oldest→newest, all driven by shareable URL search params (`src/app/rides/page.tsx:20-52`).

---

## 2. What is the plan

### Active plan: v3 Organic Launch Pilot (`docs/designs/v3-one-route-pilot.md`, status: APPROVED)

The pilot answers one question with real behavior, not stated interest: **does anyone use an open board carried into existing ride-sharing groups?**

- **Distribution is pasting the site link into existing WhatsApp/Telegram ride-sharing groups.** No paid growth, no manufacturing demand/supply (`TODOS.md` T-1). People post organically. The board looks sparse at first; that is expected.
- **No seeding of any kind** — founder decision on honesty grounds. Fixtures stay in local dev/test. The earlier "one seeded route" idea was removed during review.
- **Pilot gates (day 21, worst row wins, founder actions excluded):**

| Metric | Proceed | Ambiguous (extend 2 wks) | Stop |
|---|---|---|---|
| Posts by someone other than the founder | ≥ 3 | 1–2 | 0 |
| Conversations started by someone other than the founder | ≥ 5 | 1–4 | 0 |
| Arrivals (unique visits to `/rides` or a post) | ≥ 40 | 10–39 | < 10 |

Any row at zero stops; non-founder posts at zero stops regardless. **Day-3 checkpoint:** arrivals ~0 at day 3 means the link is dead (deleted/buried/ignored) — re-share or pick a different group rather than burning 18 more days.
- `wanted_routes` (routes people searched for and did not find) is **demoted from gate to qualitative signal**: on an empty board every search misses, so it would trivially "pass" while posts sit at zero. Kept because the route *names* tell you where demand clusters.
- **The Assignment (still open):** scroll back 60 days in the real WhatsApp group and count — for every real ride post, did it match, how many replies, was money mentioned first by poster or responder. The group is still unnamed and uncounted; that count picks which groups to share into.

### Superseded plans (do not build from these)

- `docs/designs/v2-identity-first-increment.md` (DRAFT): proposed migrating auth to phone+OTP with username/DOB, then offers/completion/ratings. Superseded by v3.
- `docs/designs/v3-spec-source.md`: older full-spec vision (phone+OTP only, 5-conversation cap, completion/ratings taxonomy, structured `$` offers shelved). Useful context for *why* things were deferred, but the implemented auth is email-based (see §4 divergence) and the pilot scope is much narrower.

### Permanent rules (`TODOS.md` P-1–P-4, never "done", never reversed)

1. **Chat privacy absolute** (above).
2. **Platform suggests, never decides:** post content is always user-filled. A default (e.g. FROM city guessed from IP) may be offered but must always be changeable.
3. **No platform-set price, ever** — no set/suggest/compute/cap/display, and not even a poster-typed price field (classification risk; BlaBlaCar's cap does not transfer to the US).
4. **No fake posts or accounts on production**, ever.

### Deferred work (`TODOS.md` T-1–T-6)

T-1 growth/marketing beyond link-sharing (revisit only if day-21 gates pass). T-2 two airport sources of truth (rider geocoded vs captain hand-picked; silent mismatch risk; airport is display/filter aid, not a join key, until real posts show frequency). T-3 five-conversation cap (ships without it, so conversation creation is unthrottled — both a metric risk and spam surface). T-4 stale-post accumulation watch (no expiry ceiling, so far-future posts can crowd the feed; monitor, don't prevent). T-5/T-6 are stale: the GitHub remote now exists (`origin https://github.com/urstrulymithilesh/ride4ride.git`) and the old-folder cleanup refers to a path on a previous machine.

---

## 3. Approach

### Product approach

- **Board, not dispatcher.** Mobile-first (arrivals come from chat links on phones), utility over polish, minimal JS weight for mobile data/low-end devices.
- **Open discovery, displayed affiliation.** Anyone can browse; trust comes from visible signals, not gates.
- **Single-route thinking dissolved:** removing seeding turned the pilot from "one seeded route" into an organic launch across groups in several cities.

### Privacy/safety architecture (the load-bearing part)

The invariant — *no public or non-revealed query can return a full address or precise coordinate* — is enforced in three layers (`README.md`):

1. **Schema:** address/coordinate columns live only in row-protected `ride_locations`; public `rides` has none. Coarse fields (city/state/zip) + `distance_meters` stay public.
2. **Runtime (RLS):** `ride_locations` returns a row only to the owner or a counterparty with `agreed = true` in `ride_reveals`. The `rides_with_location` security-invoker view joins the two so authorized users get addresses and everyone else gets NULLs under the same RLS. `service_role` bypasses RLS, so that key stays server-only. Blocking is also RLS-enforced (restrictive INSERT policies on `conversations`/`messages` reject writes across a block via security-definer `block_exists`); banned users can't post/message.
3. **Static guard:** `npm run check:privacy` (`scripts/check-privacy.mjs`) fails the build if code reads address columns via the service-role client, selects them off public `rides`, queries `messages` with service-role, signs/downloads chat images outside the purge job, or logs message content. Runs `--self-test` first so a broken guard fails loudly.

Related safety pieces: 18+ self-attestation + Terms acceptance recorded atomically at signup (trigger, §4); report/block everywhere with `/admin` takedown/ban (`src/app/admin/page.tsx`, hidden by `notFound` from non-admins); reveal panel shows "meet in public / tell a friend" checklist before addresses are shared; post detail ships `noindex` (shareable in chat, not left in search indexes; messenger previews still work via OG tags).

### Engineering approach

- **Stack:** Next.js 16.2.10 (App Router) + React 19 + TypeScript + Tailwind CSS 4; Supabase (Auth, Postgres, Realtime, Storage); Vercel hosting. Per `AGENTS.md`, Next 16 has breaking changes vs training data — read `node_modules/next/dist/docs/` before writing framework code.
- **DB-first correctness:** expiry is a `BEFORE INSERT OR UPDATE` trigger deriving `expires_at` on every write (callers can't set it); arrival uniqueness is a UNIQUE constraint + `ON CONFLICT DO NOTHING` (a schema property, not a query that can drift); rate limiting is Postgres-backed (`rate_limit_take()`, security-definer) because serverless instances share no memory.
- **Failure-mode honesty:** the feed and detail page distinguish *query error* from *empty board* (a silent DB failure once rendered as "0 rides" and a dead shared link as "post deleted"). Error states, logging, and counts are kept separate by construction (`src/app/rides/page.tsx:72-90`, `src/app/rides/[id]/page.tsx:130-138`).
- **Silent instrumentation:** arrival recording and analytics never take down the page they measure; crawlers/previews/uptime checks are excluded by UA; missing IPs are skipped (undercount preferred to inflation).
- **CI (`.github/workflows/ci.yml`):** Static job (`npm run check`) + Database job (Supabase CLI full-stack start, `supabase db reset` replaying all migrations from scratch, credential resolution by value shape, all SQL proofs in `supabase/tests/`, REST integration tests through PostgREST with the anon key). Recent history shows this catching real gaps (partial-stack start, anon-vs-authenticated policy mismatches).
- **Legal posture in code:** Terms (`src/app/terms/page.tsx`) and Privacy (`src/app/privacy/page.tsx`) pages exist as attorney-review templates (explicit placeholder banners, undated); the fuller disclaimer draft (`docs/legal/disclaimer-draft.md`) states the board-not-transport, no-vetting, no-liability, free-forever, chat-privacy, and 18+ positions.

---

## 4. What is done so far

Scaffolding through the pilot backend are shipped. HEAD is `14462ba` on `main` (synced with `origin/main`); local `.env.local` exists; 14 migrations + 7 SQL proof files exist.

- **Phase 0 scaffolding:** Next.js + TS + Tailwind, Supabase browser/server/admin clients (`src/lib/supabase/`), session proxy (`src/proxy.ts`), folder structure, env template (`.env.local.example` documents Supabase, Mapbox server-only, VAPID, `RATE_LIMIT_SALT`, `CRON_SECRET`, `EDU_VERIFICATION_MODE`).
- **Phase 1 auth + shell:** email/password sign-up/sign-in/sign-out, session-aware header (`src/components/layout/site-header.tsx`), `profiles` + RLS + auto-create trigger (`0001`), `requireUser()`/`getUser()` gate (`src/lib/auth.ts`) with `<AuthGate>`/`<SignInPrompt>`.
- **Phase 2 data model + RLS (`0002`):** `rides` (coarse/public), `ride_locations` (sensitive/row-protected), `ride_reveals` (consent ledger), `conversations` + `messages`. Proven by `supabase/tests/rls_address_privacy.sql`.
- **Phase 3 posting + distance (`0003`, `src/app/rides/actions.ts`, `src/lib/geocoding.ts`):** offer (city→city) and get (address→address) forms, current-vs-future timing, server-side Mapbox geocode + driving distance, atomic create via `create_offer_ride`/`create_get_ride` RPCs, shareable post page with copy-link and per-post OG metadata (route/date/direction/distance only — never ZIP, description, or locations).
- **Phase 3.5 reveal handshake (`0005`, `src/components/chat/reveal-panel.tsx`):** either party requests, other confirms; `set_ride_reveal()` sets only the caller's flag; mutual agreement flips `agreed = true` and RLS opens addresses to exactly those two. Live via Realtime. Proven by `rls_reveal_handshake.sql`.
- **Phase 4 browse/detail:** public listings with tabs/filters/sort via URL params, `RideCard` grid, named-column selects only (`CARD_COLUMNS`, `src/app/rides/page.tsx:14-15`); detail gates poster/description/contact behind sign-in and owner addresses behind ownership.
- **Phase 5 expiry/notifications/cleanup (`0006`, `src/app/api/cron/*`, `src/lib/push.ts`, `public/sw.js`):** `expire-rides` (pre-expiry push within 1h + flip past-due to `expired`, every 30 min) and `purge-chats` (delete past-`auto_delete_at` conversations + Storage images, hourly), both requiring `Authorization: Bearer $CRON_SECRET`; VAPID push with per-user subscriptions and contextual prompt on the owner's post; one-click repost of expired posts.
- **Phase 6 chat (`0004`, `src/app/messages/`):** find-or-create conversation RPC, participant-only RLS, image-only private `chat-images` bucket with per-conversation Storage RLS + signed URLs, `auto_delete_at` triggers (created+24h vs ride_date+24h).
- **Trust & safety (`0007`):** `reports`, `blocks` (+ RLS blocking across conversations/messages/posting), `allowed_email_domains`, admin page + ban/takedown via service-role after `is_admin` check. Proven by `rls_blocking_and_verify.sql`.
- **Pilot hardening (`0008–0016`):**
  - `0008` expiry hardening: trigger-derived `expires_at` (ride_date+8d midnight, else created+7d), `p_expires_at` removed from RPCs, `repostRide` reconciled. Proof `supabase/tests/expiry_rule.sql`.
  - `0009` 18+/TOS record: `profiles.age_confirmed_18/tos_accepted_at/tos_version`, atomic signup-trigger write from `raw_user_meta_data` (`TOS_VERSION` in `src/lib/validations/auth.ts`), client UPDATE locked to `display_name` only, `profiles_missing_tos()` report.
  - `0010–0012` wanted-routes: `wanted_routes` (coarse city/state + IATA airport codes + date window + role, anonymous inserts with `created_by = null`, no UPDATE/DELETE policies, claim via service-role cookie flow in `src/lib/wanted-routes.ts`), standing `WantedRouteForm` on the feed, `0012` fixing the anon-insert policy. Proof `wanted_routes_rls.sql`.
  - `0011` rate limiting: `rate_limit_hits` (salted IP hash only, no policies, service-role only) + `rate_limit_take()`; currently wired to the anonymous wanted-routes endpoint (5/hour). Proof `rate_limit.sql`.
  - `0013` open signup: `allowed_email_domains` seeded with gmail/outlook/hotmail/yahoo/icloud alongside `.edu`; student-badge function dropped and `verification`/`school` columns left inert; signup-allowlist meaning only.
  - `0014` arrival tracking: `arrival_events` (salted IP hash + `feed`/`post` surface + optional `user_id` + day, unique per visitor/surface/day), RLS-on-with-no-policies, `arrival_report()` for day-3/day-21 gates, `recordArrival()` called on feed and post pages with bot/IP filtering. Proof `arrival_tracking.sql`.
  - `0015` masked street display: public `rides.from_street`/`to_street` (street name only, never a number), get-only check constraints, `create_get_ride` extended, `maskedStreet()` derived server-side from Mapbox's street-name field with a leading-digit strip, shown as "Main St · Riverside, CA" on cards/detail. `rides_with_location` dropped + recreated (REPLACE fails with 42P16 since 0006 widened `rides` after 0002). Proof `masked_street.sql` (6 assertions). Live-verified ("Bromley Lane", no number).
  - `0016` airports: REMOVED 2026-10-04 by founder decision (`0018_remove_airports.sql` drops the table, function, `rides.from_airport`, wanted-routes airport columns, and both RPC params; app display/filter/validation removed with it). The T-2 boundary-mismatch risk died with the feature. Historical note retained: public `airports` reference table, `nearest_airport()` haversine, rider derivation in `create_get_ride`, captain explicit pick, ✈ display + `?airport=` filter. Live-verified before removal (offer posted with ORD; Get post auto-derived MDW).
  - Feed/detail error-vs-empty split, `noindex` on post detail + admin, OG share metadata, `check-privacy` extended to chat contents, full-stack CI with migration replay + REST tests, `notFound()`-returns-200 investigated and closed as works-as-designed (root `loading.tsx` streams 200 + framework `noindex`).
- **Post-pilot app additions (no migration):** one-tap quick message (`startConversation` sends a canned opener into empty conversations, copy flips by post type), homepage signup counter (service-role count, `unstable_cache` 60 s, hides on failure), IP-suggested FROM city (Vercel geo header as filter-box default only, never a filter or post fill).
- **Unit tests:** Vitest 3 (`npm test`, 26 tests: ride/wanted-route validations, formatters) wired into CI Static checks. (Vitest 5 refused: needs `@types/node` 22+, repo pins 20.)
- **Production (live 2026-10-03):** Vercel project reconnected to `urstrulymithilesh/ride4ride` (was linked to a different repo serving foreign code — "Project Link not found"), env vars set (public keys as Config, secrets as Secret), DNS realigned to Vercel's recommended CNAME (apex + www, proxy off), Deployment Protection off, stale Framework-Override deployment replaced, Hobby-legal daily crons in `vercel.json` + real cadence via cron-job.org (both 200-verified). CI green on every push.

### Known divergence to be aware of

`docs/designs/v3-spec-source.md` §4 specifies **phone + OTP only, no email ever**, with DOB/username/session/OTP-limit details. The **implemented** system is **email + password** (Supabase Auth, confirmation-email flow via `/auth/confirm`, open signup allowlist including consumer domains). Do not treat the spec-source auth section as built. Similarly, the v2 phone-migration plan was superseded and not implemented. (Update 2026-10-03: unique username handles ARE being built in the parallel session — `0017_usernames`, already applied to prod — but auth itself stays email-based.)

---

## 5. What is left to work on

### A. v3 "What Ships" items — status 2026-10-03

DONE since the last revision: masked street (#5), one-tap quick message (#8), signup counter (#9), IP-suggested FROM city (#12), Vitest coverage (#11, unit scope — DB behavior stays in `supabase/tests/`). Airports (#7) was built, live-verified, then REMOVED entirely by founder decision (see `0018`).

Still open:

1. **Disclaimer rewrite B2 + B4 with legal sign-off** — Terms/Privacy pages are still attorney-review placeholders (undated, bannered). The "free forever, no take rate" line is present in-app, but the pilot requires the corrected text to be version 1 with legal sign-off. Needs a lawyer, not code.
2. **Claim-flow unit tests** — Vitest covers validations/formatters; the wanted-routes claim flow (`lib/wanted-routes.ts`) has no unit coverage (needs DB mocking).
3. **Rider-derivation live proof** — `nearest_airport()` is proven in SQL but no live Get post has exercised it yet (board currently holds one offer).

### B. Pre-launch gate (`PRE_LAUNCH_CHECKLIST.md` — mostly done 2026-10-03)

Done: migrations `0001–0016` on production; RLS proofs green in CI (+ replayed from scratch); `check:privacy` in CI; manual signed-out/non-revealed audit (masked streets + reveal verified on live posts); secrets set (public as Config, secrets as Secret); cron auth verified (both jobs 200 via cron-job.org on real cadence + daily Vercel backstop); domain + TLS + `NEXT_PUBLIC_SITE_URL`; Supabase Auth URLs incl. prod confirm; admin account exists; report → takedown verified; block/unblock + reveal verified; VAPID keys set.

Still open: full click-through re-check after latest deploys, push-delivery + expiry-flip + purge observed live (not just 200s), lawyer-reviewed dated TOS/Privacy, support/abuse mailboxes, mobile 375px pass, error monitoring (`app/error.tsx`), Supabase backups, rate limits beyond wanted-routes.

### C. Suggested build order (remaining)

1. Attorney TOS/Privacy pass → set `TOS_VERSION` date → `profiles_missing_tos()` backfill check.
2. Claim-flow unit tests (DB-mocked) if the claim path changes; otherwise as-is.
3. Prod apply of any new migration + proofs-against-prod + cron/push smoke tests.
4. Then run the pilot: share links into counted groups, watch the day-3 arrival checkpoint, read day-21 gates.

### D. Two-session protocol (added 2026-10-03)

Two sessions share this working tree: this one (backend/product) and a design/layout session (theme, fonts, nav, profile pages, feed rewrite, `0017_usernames`). Rules learned the hard way:
- Never `git add -A`: a whole-file add sweeps the other session's uncommitted work into your commit (homepage icons shipped inside the label commit this way).
- Stage exact files only; verify with `git diff --cached --stat` before committing.
- A pushed commit that must go away means a history rewrite (`push --force-with-lease`) — founder's word required, and the other session must be warned first.
- New migrations must be replay-safe (CI `db reset` replays all files; preview branches replay onto dirty DBs) — every CREATE needs a preceding DROP-IF-EXISTS (see the 0012/42710 incident).
- Pushes only on explicit founder confirmation, verified on localhost first.

### D. Guardrails for any new work

- Read `node_modules/next/dist/docs/` before framework code (Next 16 breaking changes, `AGENTS.md`).
- Never select `*` on `rides`/`rides_with_location` in public paths; never widen OG/metadata selects without a privacy review; `service_role` stays server-only (`src/lib/supabase/admin.ts`, `src/lib/arrivals.ts`, claim flow).
- `npm run check` must stay green; extend `scripts/check-privacy.mjs` if a new sensitive path appears.
- Keep instrumentation salted (`RATE_LIMIT_SALT`), bot-filtered, silent-failing, and coarse (`feed`/`post` only).
- No price field, no fake data on prod, no message-body reads for any purpose.
