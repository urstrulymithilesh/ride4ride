# TODOS

Deferred work and permanent rules for Ride4Ride. Each item carries its reasoning,
because a TODO without its why creates false confidence that the thinking was captured.

Created 2026-08-28 during `/plan-eng-review`. Repo `main`, first commit `f07b511`.

---

## Permanent rules (not TODOs — these never get "done", and never get reversed)

### P-1. Chat privacy is absolute

Nobody except the two people in a conversation can ever read its contents. Not
operators, not analytics, not research, not product improvement. No exceptions,
permanently.

**Consequence already applied:** the price-conversation metric (measuring how often
money is raised in the first three messages, to test whether Premise 3's no-price-field
rule is affordable) is **off the table forever**, not deferred. It required an operator
read of message bodies. It does not come back in increment B or anywhere else.

**Enforcement idea worth building:** `scripts/check-privacy.mjs` already fails the build
if a file references address columns while using the service-role client. The same guard
shape applied to `messages` would make this rule CI-enforced rather than a promise.

### P-2. The platform suggests, it never decides

Post content is always filled in by the user. The platform may offer a default (for
example, a FROM city guessed from IP) but must never auto-fill or decide what a post
actually says. Every suggestion is changeable, any number of times.

### P-3. No platform-set price, ever

The platform may never set, suggest, compute, cap, or display a price. Classification as
a transportation service turns on *who sets the price*, not on whether payment is
processed. A platform-computed cap makes the platform the price-setter, the same risk
category as a bid field. BlaBlaCar's cap does not transfer: it caps a *driver-set* price
under an explicit EU carpooling safe harbor a US platform does not get. Money exists only
in free text between users, which is user speech. Also ruled out: a poster-typed price
field, even though it would be user-set.

### P-4. No fake posts or fake accounts on production

Fixtures are local development and test only. The board looks sparse until it does not.

---

## Deferred

### T-1. Growth and marketing work

**What:** Any active growth beyond directly sharing the site link into existing WhatsApp
and Telegram ride-sharing groups.

**Why deferred:** The platform helps people connect. It does not manufacture demand or
supply. Adding acquisition machinery now would add complexity before there is evidence
anyone wants the board at all, and it would blur whether early activity is real.

**Depends on:** The day-21 pilot result. If posts and conversations clear their gates,
revisit. If they do not, growth spend would have been spent on a board nobody wanted.

### T-2. Two airport sources of truth

**What:** Rider posts derive their airport from geocoded coordinates; captain posts take
an airport the poster picks by hand. The two will disagree at boundaries — a rider
geocoded near the ORD/MDW line versus a captain who selected the other one.

**Why it matters:** This fails *silently*. It does not throw, it does not warn; a rider
and a captain who should match simply never see each other. On a thin board that reads as
"no demand" rather than as a bug, which is the worst possible failure mode for a pilot
whose entire output is a demand judgement.

**Current mitigation:** airport is treated as a display and filter aid, not a join key.

**Depends on:** Real posts. Cannot be tuned without seeing how often it actually occurs.

**Where to start:** the `airports` table radius values, and whether captain posts should
be geocoded after all rather than picking from a list.

### T-3. Five-conversation cap

**What:** The spec's limit of 5 ongoing conversations per user, deferred out of the pilot.

**Why it matters now:** One-tap quick messaging ships in the pilot *without* the cap, so
starting conversations is effectively free and unthrottled. "Conversations started" is
one of the three proceed gates, so cheap conversation creation is both a metric risk and
a spam surface.

**Depends on:** increment B, which is where the conversation model gets its remaining
pieces.

### T-4. Stale-post accumulation watch

**What:** Post expiry is now keyed to the ride date (`ride_date + 7 days`, or
`created_at + 7 days` when there is no ride date). There is deliberately **no ceiling**,
so a ride posted for three months out stays listed for three months.

**Why it matters:** This is monitored rather than prevented, by choice. A thin board full
of far-future posts looks alive but is not matchable, which is a different failure from an
empty board and harder to spot.

**Depends on:** nothing. Just look at the feed during the pilot and see whether far-future
posts crowd out near-term ones.

### T-5. Repository remote

**What:** Create the GitHub repo `ride4ride` and add it as a remote. Local `main` has no
remote today.

**Why deferred:** `gh` is not installed on this machine, so the remote could not be created
during the session that initialized the repo.

**Depends on:** either installing `gh`, or creating the empty repo in the browser and
supplying the URL.

### T-6. Delete the old working folder

**What:** `D:\New folder\notride4ride` still exists as an un-versioned copy of the
codebase, from before the migration to `ride4ride`.

**Why it is still there:** deleting it is destructive and was not explicitly requested.
It should go once this repo is confirmed good, because two copies of a codebase with only
one under version control is exactly how the wrong one gets edited.
