#!/usr/bin/env node
/**
 * Resolve local-Supabase credentials from `supabase status -o json` by
 * INSPECTING VALUES rather than guessing key names.
 *
 * WHY. Two CI runs were lost to key-name guesses. `.DB_URL` matched, so the
 * JSON is SCREAMING_SNAKE, but `.ANON_KEY` / `.SERVICE_ROLE_KEY` did not —
 * and a third guess is not an engineering strategy. Key names are the
 * CLI's business and change between versions; the VALUES are
 * self-identifying and do not:
 *
 *   - a legacy anon key is a JWT whose payload is {"role":"anon", ...}
 *   - a legacy service key is a JWT with {"role":"service_role", ...}
 *   - newer keys are prefixed `sb_publishable_` / `sb_secret_`
 *   - an API URL is an http(s) URL, and is not the Postgres DB URL
 *
 * So this walks every value in the blob, decodes anything JWT-shaped, and
 * picks by role. A renamed key cannot break it.
 *
 * Also prints a redacted inventory — key, type, length, and for JWTs the
 * decoded `role` — so if this ever still fails, the log says exactly why
 * without dumping credentials.
 *
 * Usage:
 *   node scripts/resolve-supabase-env.mjs /tmp/sb.json            # report
 *   node scripts/resolve-supabase-env.mjs /tmp/sb.json --github-env
 *   node scripts/resolve-supabase-env.mjs --self-test
 */
import { readFileSync, appendFileSync } from "node:fs";

/** Decode a JWT payload without verifying — we only want the role claim. */
function jwtRole(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Flatten nested objects so a value one level down is still found. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

export function resolve(blob) {
  const flat = flatten(blob);
  const inventory = [];
  let anon = null;
  let service = null;
  let apiUrl = null;

  for (const [key, value] of Object.entries(flat)) {
    const isStr = typeof value === "string";
    const role = jwtRole(value);
    inventory.push({
      key,
      type: typeof value,
      length: isStr ? value.length : null,
      role,
      shape: !isStr
        ? String(value)
        : role
          ? `JWT(role=${role})`
          : value.startsWith("sb_publishable_")
            ? "sb_publishable_…"
            : value.startsWith("sb_secret_")
              ? "sb_secret_…"
              : /^postgres(ql)?:\/\//.test(value)
                ? "postgres URL"
                : /^https?:\/\//.test(value)
                  ? value
                  : value.length > 24
                    ? `${value.slice(0, 8)}… (${value.length} chars)`
                    : value,
    });

    if (!isStr) continue;

    // Credentials, by content.
    if (role === "anon" || value.startsWith("sb_publishable_")) anon ??= value;
    if (role === "service_role" || value.startsWith("sb_secret_")) service ??= value;

    // API URL: an http(s) URL that is not the studio/inbucket/db endpoint.
    if (/^https?:\/\//.test(value) && !apiUrl) {
      const looksAuxiliary = /studio|inbucket|mailpit|analytics|imgproxy/i.test(key + value);
      if (!looksAuxiliary) apiUrl = value;
    }
  }

  return { anon, service, apiUrl, inventory };
}

// ── self-test ────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const mkJwt = (role) =>
    "h." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".s";

  const cases = [
    [
      "legacy SCREAMING_SNAKE names",
      { API_URL: "http://127.0.0.1:54321", ANON_KEY: mkJwt("anon"), SERVICE_ROLE_KEY: mkJwt("service_role"), DB_URL: "postgresql://x" },
      { anonRole: "anon", serviceRole: "service_role", api: "http://127.0.0.1:54321" },
    ],
    [
      "completely different key names (the case that broke CI twice)",
      { apiGatewayEndpoint: "http://127.0.0.1:54321", publicKey: mkJwt("anon"), privilegedKey: mkJwt("service_role") },
      { anonRole: "anon", serviceRole: "service_role", api: "http://127.0.0.1:54321" },
    ],
    [
      "new sb_ prefixed key format",
      { API_URL: "http://127.0.0.1:54321", PUBLISHABLE: "sb_publishable_abc123", SECRET: "sb_secret_xyz789" },
      { anonPrefix: "sb_publishable_", servicePrefix: "sb_secret_", api: "http://127.0.0.1:54321" },
    ],
    [
      "nested one level deep",
      { services: { api: { url: "http://127.0.0.1:54321" } }, keys: { anon: mkJwt("anon"), service: mkJwt("service_role") } },
      { anonRole: "anon", serviceRole: "service_role", api: "http://127.0.0.1:54321" },
    ],
    [
      "studio URL must not be mistaken for the API URL",
      { STUDIO_URL: "http://127.0.0.1:54323", API_URL: "http://127.0.0.1:54321", ANON_KEY: mkJwt("anon"), SERVICE_ROLE_KEY: mkJwt("service_role") },
      { api: "http://127.0.0.1:54321" },
    ],
    [
      "postgres URL must not be mistaken for the API URL",
      { DB_URL: "postgresql://postgres@127.0.0.1:54322/postgres", API_URL: "http://127.0.0.1:54321", ANON_KEY: mkJwt("anon"), SERVICE_ROLE_KEY: mkJwt("service_role") },
      { api: "http://127.0.0.1:54321" },
    ],
    [
      "db-only blob resolves NOTHING (the `supabase db start` case)",
      { DB_URL: "postgresql://postgres@127.0.0.1:54322/postgres" },
      { anonNull: true, serviceNull: true, apiNull: true },
    ],
  ];

  let bad = 0;
  for (const [name, blob, expect] of cases) {
    const r = resolve(blob);
    const checks = [];
    if (expect.anonRole) checks.push(jwtRole(r.anon) === expect.anonRole);
    if (expect.serviceRole) checks.push(jwtRole(r.service) === expect.serviceRole);
    if (expect.anonPrefix) checks.push(String(r.anon).startsWith(expect.anonPrefix));
    if (expect.servicePrefix) checks.push(String(r.service).startsWith(expect.servicePrefix));
    if (expect.api) checks.push(r.apiUrl === expect.api);
    if (expect.anonNull) checks.push(r.anon === null);
    if (expect.serviceNull) checks.push(r.service === null);
    if (expect.apiNull) checks.push(r.apiUrl === null);
    const ok = checks.every(Boolean);
    if (!ok) bad++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${name}` +
        (ok ? "" : `\n          anon=${r.anon} service=${r.service} api=${r.apiUrl}`),
    );
  }
  if (bad > 0) {
    console.error(`\nSELF-TEST FAILED: ${bad} case(s).`);
    process.exit(1);
  }
  console.log("\nSelf-test passed: credentials resolve by value, independent of key names.");
  process.exit(0);
}

// ── normal run ───────────────────────────────────────────────────────
const file = process.argv.find((a) => a.endsWith(".json"));
if (!file) {
  console.error("resolve-supabase-env: pass the path to `supabase status -o json` output.");
  process.exit(1);
}

let blob;
try {
  blob = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`resolve-supabase-env: could not parse ${file}: ${err.message}`);
  process.exit(1);
}

const { anon, service, apiUrl, inventory } = resolve(blob);

console.log("--- supabase status inventory (values redacted) ---");
for (const i of inventory) {
  console.log(`  ${i.key.padEnd(34)} ${i.shape}`);
}
console.log("---------------------------------------------------");

const resolvedApi = apiUrl ?? "http://127.0.0.1:54321";
if (!apiUrl) {
  console.log("note: no API URL found in the blob; using the CLI's default local endpoint.");
}
console.log(`resolved API URL : ${resolvedApi}`);
console.log(`resolved anon    : ${anon ? `found (${anon.length} chars)` : "NOT FOUND"}`);
console.log(`resolved service : ${service ? `found (${service.length} chars)` : "NOT FOUND"}`);

if (!anon || !service) {
  // The shape of the blob tells you WHY. If the only thing present is a
  // database URL, no credential is missing — the API services simply are
  // not running, and no amount of key-name matching will conjure them.
  const keys = inventory.map((i) => i.key);
  const onlyDatabase =
    !apiUrl && keys.length <= 2 && keys.every((k) => /^(DB_URL|DATABASE_URL)$/i.test(k));

  if (onlyDatabase) {
    console.error(
      "\nresolve-supabase-env: the API stack is not running.\n" +
        "  The status blob contains ONLY a database URL, so Postgres is up and\n" +
        "  nothing else is. That is what `supabase db start` does: it starts the\n" +
        "  database alone, without Kong, PostgREST or GoTrue — which is why SQL\n" +
        "  proofs pass (they need only DB_URL) while REST tests have nothing to\n" +
        "  talk to.\n" +
        "  Fix: start the full stack with `supabase start`, not `supabase db start`.",
    );
  } else {
    console.error(
      "\nresolve-supabase-env: could not identify the anon and/or service-role key.\n" +
        "  Looked for a JWT with role=anon / role=service_role, and for sb_publishable_ /\n" +
        "  sb_secret_ prefixes, across every value above. If the inventory shows a\n" +
        "  credential in a shape not covered, add it to resolve() — do not guess a key name.",
    );
  }
  process.exit(1);
}

if (process.argv.includes("--github-env") && process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    `SUPABASE_URL=${resolvedApi}\nSUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`,
  );
  console.log("\nexported SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
}
