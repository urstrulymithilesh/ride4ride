import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting for endpoints reachable without an account.
 *
 * Backed by Postgres (see 0011_rate_limit.sql) because Vercel spreads
 * invocations across instances that share no memory — an in-process
 * counter would reset constantly, see only a fraction of traffic, and
 * give the appearance of a limit while stopping almost nothing.
 *
 * Only a SALTED hash of the client IP is ever stored or sent to the
 * database. The salt matters: an unsalted IPv4 hash is reversible by
 * brute force over the whole 2^32 space, which would make the stored
 * value personal data rather than a pseudonym.
 */

/** Endpoints under rate limiting. Add a member, not a string literal. */
export type RateLimitBucket = "wanted_routes";

interface Limit {
  limit: number;
  windowSeconds: number;
}

const LIMITS: Record<RateLimitBucket, Limit> = {
  // A genuine person submits one, maybe three. Five an hour is generous
  // for real use and tight against a flood.
  wanted_routes: { limit: 5, windowSeconds: 60 * 60 },
};

let warnedAboutSalt = false;

function subjectHash(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt && !warnedAboutSalt) {
    warnedAboutSalt = true;
    console.warn(
      "[rate-limit] RATE_LIMIT_SALT is not set. Rate limiting still works, " +
        "but IP hashes are unsalted and therefore reversible by brute force. " +
        "Set RATE_LIMIT_SALT (see .env.local.example) before launch.",
    );
  }
  return createHash("sha256").update(`${salt ?? "ride4ride"}:${ip}`).digest("hex");
}

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; the left-most entry
 * is the original client. Locally this is usually absent, which is fine:
 * everything collapses to one bucket in dev.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Consume one token for this bucket. Returns true when the caller may
 * proceed.
 *
 * FAILS CLOSED. If the check itself errors, the request is refused. A
 * spam control that opens up whenever the database hiccups is not a spam
 * control, and this endpoint is unauthenticated. The cost of being wrong
 * is one person seeing "try again shortly"; the cost the other way is an
 * open flood vector on the table whose whole purpose is being countable.
 */
export async function takeRateLimit(bucket: RateLimitBucket): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[bucket];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_take", {
      p_bucket: bucket,
      p_subject_hash: subjectHash(await clientIp()),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error(`[rate-limit] check failed for ${bucket}:`, error.message, error);
      return false; // fail closed
    }
    return data === true;
  } catch (err) {
    console.error(`[rate-limit] check threw for ${bucket}:`, err);
    return false; // fail closed
  }
}
