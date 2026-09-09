#!/usr/bin/env node
/**
 * Privacy guard (runs in CI / `npm run check:privacy`).
 *
 * Two invariants, both stated as product rules and until now enforced only
 * by everyone remembering them. This makes them build failures.
 *
 * ── ADDRESSES ────────────────────────────────────────────────────────
 * A full address or precise coordinate can only ever be read through an
 * RLS-protected path (the caller's session client against
 * `ride_locations` / `rides_with_location`).
 *
 *   RULE 1  A file referencing address/coordinate columns must NOT use the
 *           service-role admin client, which BYPASSES RLS.
 *   RULE 2  A query against the public `rides` table must not select
 *           address/coordinate columns.
 *
 * ── CHAT ─────────────────────────────────────────────────────────────
 * "Chat privacy is absolute. Nobody except the two participants can ever
 * read a conversation. Not operators, not analytics, not research."
 * (TODOS.md P-1, and the reason the pilot's price metric was CUT rather
 * than quietly taken.)
 *
 *   RULE 3  No file may query `messages` with the service-role client.
 *           There is no legitimate operator use: the purge job deletes
 *           CONVERSATIONS and messages disappear by FK cascade, so nothing
 *           needs admin access to the message rows themselves.
 *   RULE 4  The `chat-images` bucket may be LISTED and REMOVED with the
 *           admin client (the purge job must), but never DOWNLOADED or
 *           handed out as a signed/public URL. Those are reads.
 *   RULE 5  Message content must not be logged. In any file that queries
 *           `messages`, a console call touching `.body` / `body:` /
 *           `image_url` is chat content heading for a log sink.
 *
 * Static guard, complementary to the SQL proofs in supabase/tests/. It
 * cannot see runtime behaviour — see T26 for the PostgREST-level gap.
 *
 * Run `node scripts/check-privacy.mjs --self-test` to verify the rules
 * actually fire. A guard nobody has seen fail is not known to work.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

const ADDRESS_COLUMNS = [
  "from_address",
  "to_address",
  "from_lat",
  "from_lng",
  "to_lat",
  "to_lng",
];

/** Message content. Deliberately NOT matched as bare words: `body` alone
 *  appears in every fetch/response in the codebase. Only ever used in
 *  combination with a `messages` query or a property-access shape. */
const MESSAGE_CONTENT = ["body", "image_url"];

const ADMIN_CLIENT = "createAdminClient";
const CHAT_BUCKET_HINTS = ["CHAT_BUCKET", "chat-images"];

/** `.from("messages")` — the query, not the word. A comment saying
 *  "messages cascade via FK" must not trip this. */
const MESSAGES_QUERY = /\.from\(\s*["'`]messages["'`]\s*\)/;

/** Storage reads that hand content out. `.list` and `.remove` are absent
 *  on purpose: the purge job needs both and neither exposes content. */
const STORAGE_READS = /\.(download|createSignedUrls?|getPublicUrl)\s*\(/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * All rules in one place so the self-test can run them against synthetic
 * source without touching the filesystem.
 */
export function checkSource(file, text) {
  const found = [];
  const usesAdmin = text.includes(ADMIN_CLIENT);
  const queriesMessages = MESSAGES_QUERY.test(text);

  // RULE 1 — addresses via the RLS-bypassing client.
  if (ADDRESS_COLUMNS.some((c) => text.includes(c)) && usesAdmin) {
    found.push(
      `${file}: references address columns AND the service-role admin client (RLS bypass).`,
    );
  }

  // RULE 2 — address columns selected off the public `rides` table.
  const ridesSelects = text.match(
    /\.from\(\s*["'`]rides["'`]\s*\)[\s\S]{0,200}?\.select\(([\s\S]{0,200}?)\)/g,
  );
  for (const block of ridesSelects ?? []) {
    if (ADDRESS_COLUMNS.some((c) => block.includes(c))) {
      found.push(`${file}: selects an address column from the public 'rides' table.`);
    }
  }

  // RULE 3 — operator reading/writing chat rows directly.
  if (queriesMessages && usesAdmin) {
    found.push(
      `${file}: queries the 'messages' table with the service-role admin client. ` +
        `Chat is readable only by its two participants (TODOS.md P-1). The purge ` +
        `job deletes conversations; messages cascade.`,
    );
  }

  // RULE 4 — handing out chat images.
  if (
    usesAdmin &&
    CHAT_BUCKET_HINTS.some((h) => text.includes(h)) &&
    STORAGE_READS.test(text)
  ) {
    found.push(
      `${file}: downloads or signs URLs for the chat-images bucket using the ` +
        `service-role client. List and remove are allowed (the purge job needs ` +
        `them); reads are not.`,
    );
  }

  // RULE 5 — chat content reaching a log sink.
  if (queriesMessages) {
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      if (!/console\.(log|error|warn|info|debug)/.test(line)) continue;
      const touchesContent = MESSAGE_CONTENT.some(
        (c) => line.includes(`.${c}`) || line.includes(`${c}:`),
      );
      if (touchesContent) {
        found.push(
          `${file}:${i + 1}: logs message content (${line.trim().slice(0, 60)}…). ` +
            `Chat bodies must never reach a log.`,
        );
      }
    }
  }

  return found;
}

// ── self-test ────────────────────────────────────────────────────────
// Proves each rule fires on a violation and stays quiet on the legitimate
// shapes that live in this repo. Without this, a typo in a regex turns the
// guard into a no-op that reports success forever.
if (process.argv.includes("--self-test")) {
  const cases = [
    // [name, source, expect a violation?]
    ["R1 address + admin", `createAdminClient(); const a = row.from_address;`, true],
    ["R2 address off rides", `.from("rides").select("id, from_lat")`, true],
    ["R3 messages + admin", `createAdminClient(); await db.from("messages").select("*")`, true],
    ["R3 messages via session client", `await supabase.from("messages").select("*")`, false],
    [
      "R3 purge-job shape (conversations + admin, 'messages' only in a comment)",
      `createAdminClient();\n// messages cascade via FK on conversation delete\nawait admin.from("conversations").delete()`,
      false,
    ],
    [
      "R4 signing chat images",
      `createAdminClient(); admin.storage.from(CHAT_BUCKET).createSignedUrl(p)`,
      true,
    ],
    [
      "R4 purge-job list/remove",
      `createAdminClient(); admin.storage.from(CHAT_BUCKET).list(id); admin.storage.from(CHAT_BUCKET).remove(paths)`,
      false,
    ],
    [
      "R5 logging a chat body",
      `await supabase.from("messages").select("*");\nconsole.log("msg", m.body);`,
      true,
    ],
    [
      "R5 ordinary response body in a non-messages file",
      `const body = { ok: true };\nconsole.log("resp", body);`,
      false,
    ],
  ];

  let failed = 0;
  for (const [name, src, shouldFlag] of cases) {
    const got = checkSource("synthetic.ts", src).length > 0;
    const ok = got === shouldFlag;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} (expected ${shouldFlag ? "flag" : "clean"}, got ${got ? "flag" : "clean"})`);
  }
  if (failed > 0) {
    console.error(`\nSELF-TEST FAILED: ${failed} rule(s) do not behave as documented.`);
    process.exit(1);
  }
  console.log("\nSelf-test passed: every rule fires on a violation and stays quiet on legitimate code.");
  process.exit(0);
}

// ── normal run ───────────────────────────────────────────────────────
const violations = [];
for (const file of walk(SRC)) {
  violations.push(...checkSource(file, readFileSync(file, "utf8")));
}

if (violations.length > 0) {
  console.error("PRIVACY CHECK FAILED:\n" + violations.map((v) => "  - " + v).join("\n"));
  process.exit(1);
}
console.log("Privacy check passed: no address/coordinate or chat-content leak paths found.");
