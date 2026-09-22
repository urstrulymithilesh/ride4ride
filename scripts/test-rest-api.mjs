#!/usr/bin/env node
/**
 * Integration test at the layer the SQL proofs cannot reach.
 *
 * WHY THIS EXISTS (T26). Every .sql proof talks to Postgres directly. The
 * browser does not — it talks to PostgREST, which composes requests
 * differently, and that difference hid a real bug for a whole session:
 *
 *   `.insert(row).select("id")` asks PostgREST for the representation, so
 *   it runs INSERT ... RETURNING. RETURNING is evaluated against the
 *   SELECT policy, not just the INSERT check. An anonymous wanted_routes
 *   row is unreadable the instant it exists (SELECT requires
 *   created_by = auth.uid()), so the RETURNING was refused and Postgres
 *   reported "new row violates row-level security policy" — pointing at an
 *   INSERT check that was completely fine.
 *
 *   A SQL-level INSERT never exercises RETURNING, so no .sql file could
 *   have caught it. Three migrations and one wrong "fix" went by first.
 *
 * So these assertions are deliberately shaped like CLIENT calls: real
 * HTTP, real anon key, real Prefer headers.
 *
 * Env (CI derives these from `supabase status -o json`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

/**
 * Read a required env var, rejecting the shapes a shell pipeline produces
 * when a value is absent.
 *
 * `jq -r '.MISSING'` prints the literal string "null", which is TRUTHY in
 * JS. The first version of this file checked `if (!URL_BASE)` and sailed
 * straight past it, then crashed on `Failed to parse URL from null/rest/v1/…`
 * after reporting "Integration tests against null". The guard has to reject
 * the string, not just the empty value.
 */
function requireEnv(name) {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "" || raw === "null" || raw === "undefined") {
    console.error(
      `test-rest-api: ${name} is missing or literally "${raw || "empty"}".\n` +
        "  CI derives these from `supabase status -o json`; an unmatched key name\n" +
        "  yields the string \"null\" rather than nothing, so this is most likely a\n" +
        "  key-name mismatch in the workflow, not a missing step.\n" +
        "  The workflow prints the JSON keys it actually got — check that output.",
    );
    process.exit(1);
  }
  return raw;
}

const URL_BASE = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const ANON = requireEnv("SUPABASE_ANON_KEY");
const SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// A URL that is present but unusable should fail here, with a clear reason,
// rather than inside the first fetch.
try {
  const u = new URL(URL_BASE);
  if (!/^https?:$/.test(u.protocol)) throw new Error(`unexpected protocol ${u.protocol}`);
} catch (err) {
  console.error(`test-rest-api: SUPABASE_URL is not a usable URL (${URL_BASE}): ${err.message}`);
  process.exit(1);
}

/** Seeded by supabase/seed/ci-test-users.sql. */
const USER_A = "00000000-0000-0000-0000-00000000000a";

const anonH = (extra = {}) => ({
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  "Content-Type": "application/json",
  ...extra,
});
const svcH = (extra = {}) => ({
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  ...extra,
});

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

async function rest(path, { headers = anonH(), method = "GET", body } = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: r.status, text, json };
}

const wantedRow = (over = {}) => ({
  from_city: "RestTest",
  from_state: "IL",
  to_city: "RestTest",
  to_state: "IL",
  date_window_start: "2026-09-20",
  date_window_end: "2026-09-25",
  role_wanted: "get",
  ...over,
});

console.log(`Integration tests against ${URL_BASE}\n`);

// ── the regression that motivated this file ──────────────────────────
{
  const minimal = await rest("wanted_routes", {
    method: "POST",
    headers: anonH({ Prefer: "return=minimal" }),
    body: wantedRow(),
  });
  check(
    "anon can insert a wanted_route with return=minimal (the app's path)",
    minimal.status === 201,
    `got ${minimal.status} ${minimal.text.slice(0, 160)}`,
  );

  // Locks in the constraint that forced the generate-id-first design. If
  // this ever starts succeeding, the SELECT policy was loosened and
  // anonymous rows became readable — which would be a privacy change, not
  // a convenience win.
  const representation = await rest("wanted_routes", {
    method: "POST",
    headers: anonH({ Prefer: "return=representation" }),
    body: wantedRow(),
  });
  check(
    "anon insert with return=representation is REFUSED (RETURNING hits the SELECT policy)",
    representation.status >= 400,
    `got ${representation.status} — if this is now 201, anonymous rows became readable`,
  );
}

// ── nobody can attribute a row to another user ───────────────────────
{
  const forged = await rest("wanted_routes", {
    method: "POST",
    headers: anonH({ Prefer: "return=minimal" }),
    body: wantedRow({ created_by: USER_A }),
  });
  check(
    "anon CANNOT insert a wanted_route owned by another user",
    forged.status >= 400,
    `got ${forged.status} ${forged.text.slice(0, 140)}`,
  );
}

// ── the address firewall, through the real client ────────────────────
{
  const locations = await rest("ride_locations?select=from_address&limit=5");
  const leaked =
    locations.status === 200 && Array.isArray(locations.json) && locations.json.length > 0;
  check(
    "anon reads ZERO rows from ride_locations (address firewall)",
    !leaked,
    `status ${locations.status} body ${locations.text.slice(0, 140)}`,
  );

  // The public table must not even have address columns. A 200 here would
  // mean the schema regressed and coarse/sensitive data got merged.
  const ridesAddr = await rest("rides?select=from_address&limit=1");
  check(
    "the public 'rides' table exposes NO address column",
    ridesAddr.status >= 400,
    `got ${ridesAddr.status} — from_address should not exist on rides`,
  );
}

// ── chat privacy, through the real client ────────────────────────────
{
  const messages = await rest("messages?select=body&limit=5");
  const readable =
    messages.status === 200 && Array.isArray(messages.json) && messages.json.length > 0;
  check(
    "anon reads ZERO message bodies",
    !readable,
    `status ${messages.status} body ${messages.text.slice(0, 140)}`,
  );

  const arrivals = await rest("arrival_events?select=visitor_hash&limit=5");
  const arrivalsReadable =
    arrivals.status === 200 && Array.isArray(arrivals.json) && arrivals.json.length > 0;
  check(
    "anon reads ZERO arrival_events (visitor hashes are not enumerable)",
    !arrivalsReadable,
    `status ${arrivals.status} body ${arrivals.text.slice(0, 140)}`,
  );

  const limits = await rest("rate_limit_hits?select=subject_hash&limit=5");
  const hashesReadable =
    limits.status === 200 && Array.isArray(limits.json) && limits.json.length > 0;
  check(
    "anon reads ZERO rate_limit_hits (stored IP hashes are not enumerable)",
    !hashesReadable,
    `status ${limits.status} body ${limits.text.slice(0, 140)}`,
  );
}

// ── the public feed must actually work ───────────────────────────────
// Asserting the negatives alone would pass on a database where anon can
// read nothing at all, including the feed the product depends on.
{
  const seeded = await rest("rides", {
    method: "POST",
    headers: svcH({ Prefer: "return=representation" }),
    body: {
      type: "offer",
      owner_id: USER_A,
      from_city: "FeedProbe",
      from_state: "IL",
      to_city: "FeedProbe",
      to_state: "IL",
      is_future: false,
      status: "active",
    },
  });
  const rideId = Array.isArray(seeded.json) ? seeded.json[0]?.id : seeded.json?.id;
  check("service role can seed an active ride", Boolean(rideId), `got ${seeded.status}`);

  if (rideId) {
    const feed = await rest("rides?select=id,from_city&status=eq.active&limit=50");
    const visible =
      feed.status === 200 && Array.isArray(feed.json) && feed.json.some((r) => r.id === rideId);
    check("anon CAN read the active ride via the public feed", visible, `status ${feed.status}`);

    await rest(`rides?id=eq.${rideId}`, { method: "DELETE", headers: svcH() });
  }
}

// ── cleanup (CI uses a throwaway database; tidy anyway) ──────────────
await rest("wanted_routes?from_city=eq.RestTest", { method: "DELETE", headers: svcH() });

// A suite that asserted nothing must not report success.
const MIN_ASSERTIONS = 9;
console.log(`\n${passed} passed, ${failed} failed (minimum expected: ${MIN_ASSERTIONS})`);

if (failed > 0) {
  console.error("REST API TESTS FAILED.");
  process.exit(1);
}
if (passed < MIN_ASSERTIONS) {
  console.error(
    `REST API TESTS INCONCLUSIVE: only ${passed} assertions ran, expected at least ` +
      `${MIN_ASSERTIONS}. A suite that stops asserting must not pass.`,
  );
  process.exit(1);
}
console.log("All REST API integration tests passed.");
