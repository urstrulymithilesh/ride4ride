#!/usr/bin/env node
/**
 * Runs every SQL proof in supabase/tests/ against a database and fails the
 * build if any assertion reports FAIL.
 *
 * WHY THIS EXISTS. Until now the proofs ran only when someone remembered to
 * paste them into the Supabase SQL Editor by hand. In one session, three
 * migrations (0008, 0012, 0013) were each reported applied while the live
 * API proved they were not — the SQL Editor runs only the highlighted text
 * if anything is selected, so a half-run migration looks like a successful
 * one. "Runs when a human remembers, in an editor that can silently run
 * half of it" is not enforcement.
 *
 * The migration apply is the more valuable half of this job. `supabase db
 * reset` replays every migration in order against an empty database, so a
 * migration that cannot apply cleanly fails CI before any proof runs.
 *
 * HOW FAILURE IS DETECTED. The proofs report by SELECTing the literal
 * 'PASS' or 'FAIL', and one uses `raise notice ... PASSED/FAILED`. So:
 *   1. psql runs with ON_ERROR_STOP=1 — a missing function or column (i.e.
 *      an unapplied migration) aborts with a non-zero exit.
 *   2. Output is scanned for a FAIL token. Word-boundary matched, so the
 *      word "fail" inside prose does not trip it.
 *
 * Usage:
 *   node scripts/run-sql-proofs.mjs                 # uses $DATABASE_URL
 *   node scripts/run-sql-proofs.mjs --self-test     # checks the parser only
 */
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TESTS = join(ROOT, "supabase", "tests");
const SEED = join(ROOT, "supabase", "seed", "ci-test-users.sql");

/**
 * True when psql output contains a real failure token.
 *
 * Deliberately word-bounded and case-sensitive on the token: the proofs
 * emit uppercase PASS/FAIL, while explanatory prose in the same files says
 * things like "if this fails" or "SEED CHECK FAILED:" in a raised
 * exception. The first two must not trip it; a raised exception already
 * fails via the exit code.
 */
export function outputHasFailure(out) {
  return /\bFAIL(ED)?\b/.test(out);
}

/**
 * Minimum assertions each proof must actually emit.
 *
 * WHY THIS EXISTS. A proof can exit 0 having asserted NOTHING, and that is
 * not hypothetical: rls_address_privacy.sql and rls_reveal_handshake.sql
 * originally printed row counts for a human to eyeball and emitted no
 * PASS/FAIL at all. Under CI they would have gone green while `anon` read
 * every address — a test that structurally cannot fail, guarding the most
 * important invariant in the product.
 *
 * Both now self-assert. This manifest stops the regression: if a proof
 * stops asserting (a block commented out, a rewrite that drops checks),
 * the count falls short and the build fails instead of passing vacuously.
 *
 * Raise a number ONLY when deliberately adding assertions.
 */
const MIN_ASSERTIONS = {
  "expiry_rule.sql": 6,
  "rate_limit.sql": 7,
  "rls_address_privacy.sql": 5,
  "rls_blocking_and_verify.sql": 2,
  "rls_reveal_handshake.sql": 3,
  "wanted_routes_rls.sql": 7,
};

/** Proofs are ordered so a broken schema fails on the cheapest one first. */
function proofFiles() {
  return readdirSync(TESTS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// ── self-test ────────────────────────────────────────────────────────
// The parser is the part that could silently stop detecting failures and
// report green forever. Same discipline as check-privacy.mjs --self-test.
if (process.argv.includes("--self-test")) {
  const cases = [
    ["a passing proof", " test_1_anon_can_insert_unowned_row \n PASS\n(1 row)", false],
    ["a failing proof", " test_5_client_cannot_claim \n FAIL\n(1 row)", true],
    ["raise notice failure", "NOTICE:  VERIFY TEST FAILED: user self-set verification", true],
    ["raise notice success", "NOTICE:  VERIFY TEST PASSED: self-verify rejected", false],
    [
      "prose containing the word fail must NOT trip it",
      "-- If this fails, the stored IP hashes are enumerable\n PASS",
      false,
    ],
    ["mixed run with one failure", " PASS\n PASS\n FAIL\n PASS", true],
  ];
  let bad = 0;
  for (const [name, out, expected] of cases) {
    const got = outputHasFailure(out);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} (expected ${expected}, got ${got})`);
  }
  if (bad > 0) {
    console.error(`\nSELF-TEST FAILED: ${bad} case(s) — the failure detector is not reliable.`);
    process.exit(1);
  }
  console.log("\nSelf-test passed: failure detection works and prose does not false-positive.");
  process.exit(0);
}

// ── normal run ───────────────────────────────────────────────────────
const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error(
    "run-sql-proofs: DATABASE_URL is not set.\n" +
      "  CI sets it from `supabase status`. Locally:\n" +
      "    supabase start && DATABASE_URL=$(supabase status -o json | jq -r .DB_URL) npm run test:sql",
  );
  process.exit(1);
}

function psql(file) {
  return spawnSync(
    "psql",
    ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", file, DB],
    { encoding: "utf8" },
  );
}

if (!existsSync(SEED)) {
  console.error(`run-sql-proofs: missing seed file ${SEED}`);
  process.exit(1);
}

console.log("Seeding deterministic test users…");
const seeded = psql(SEED);
process.stdout.write(seeded.stdout ?? "");
if (seeded.status !== 0) {
  process.stderr.write(seeded.stderr ?? "");
  console.error("SEED FAILED — proofs not run.");
  process.exit(1);
}

let failures = 0;
for (const f of proofFiles()) {
  const path = join(TESTS, f);
  const r = psql(path);
  const out = (r.stdout ?? "") + (r.stderr ?? "");

  // A non-zero exit means psql aborted — almost always a missing function,
  // column or table, i.e. a migration that did not apply.
  const errored = r.status !== 0;
  const asserted = outputHasFailure(out);

  const passes = (out.match(/\bPASS(ED)?\b/g) ?? []).length;
  const expected = MIN_ASSERTIONS[basename(f)];
  // An unlisted proof gets a floor of 1: a new file that asserts nothing
  // should not slip through just because nobody updated the manifest.
  const floor = expected ?? 1;
  const tooFew = !errored && !asserted && passes < floor;

  if (errored || asserted || tooFew) {
    failures++;
    const why = errored
      ? "(psql error)"
      : asserted
        ? "(assertion FAILED)"
        : `(only ${passes} assertion(s), expected >= ${floor} — did a check get dropped?)`;
    console.error(`\n✗ ${basename(f)} ${why}`);
    console.error(out.trim().split("\n").map((l) => "    " + l).join("\n"));
    if (tooFew && expected === undefined) {
      console.error(
        `    NOTE: ${basename(f)} is not in MIN_ASSERTIONS. Add it so its count is checked.`,
      );
    }
  } else {
    console.log(`✓ ${basename(f).padEnd(28)} ${passes} assertion(s) passed (>= ${floor})`);
  }
}

if (failures > 0) {
  console.error(`\nSQL PROOFS FAILED: ${failures} file(s). See output above.`);
  process.exit(1);
}
console.log("\nAll SQL proofs passed.");
