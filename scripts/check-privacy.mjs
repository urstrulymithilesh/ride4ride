#!/usr/bin/env node
/**
 * Privacy guard (runs in CI / `npm run check:privacy`).
 *
 * The core Ride4Ride guarantee: a full address or precise coordinate can only
 * ever be read through an RLS-protected path (the caller's session client
 * against `ride_locations` / `rides_with_location`). This script fails the
 * build if that invariant is violated in code:
 *
 *   RULE 1  A file that references any address/coordinate column must NOT use
 *           the service-role admin client (createAdminClient), because the
 *           service role BYPASSES RLS. Addresses must never be read that way.
 *
 *   RULE 2  A query against the public `rides` table must not select address /
 *           coordinate columns (they don't exist there; selecting them would
 *           signal a schema regression).
 *
 * This is a static guard, complementary to the SQL proofs in
 * supabase/tests/ which verify the RLS behaviour at runtime.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ADDRESS_COLUMNS = [
  "from_address",
  "to_address",
  "from_lat",
  "from_lng",
  "to_lat",
  "to_lng",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const referencesAddress = ADDRESS_COLUMNS.some((c) => text.includes(c));

  // RULE 1: address columns + admin (RLS-bypassing) client in the same file.
  if (referencesAddress && text.includes("createAdminClient")) {
    violations.push(
      `${file}: references address columns AND the service-role admin client (RLS bypass).`,
    );
  }

  // RULE 2: selecting address columns off the public `rides` table.
  const ridesSelects = text.match(/\.from\(\s*["'`]rides["'`]\s*\)[\s\S]{0,200}?\.select\(([\s\S]{0,200}?)\)/g);
  for (const block of ridesSelects ?? []) {
    if (ADDRESS_COLUMNS.some((c) => block.includes(c))) {
      violations.push(`${file}: selects an address column from the public 'rides' table.`);
    }
  }
}

if (violations.length > 0) {
  console.error("PRIVACY CHECK FAILED:\n" + violations.map((v) => "  - " + v).join("\n"));
  process.exit(1);
}
console.log("Privacy check passed: no address/coordinate leak paths found.");
