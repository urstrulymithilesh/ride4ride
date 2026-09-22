import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Arrival tracking: did anyone actually reach the board?
 *
 * The day-21 gates all measure conversion. Without arrivals, a zero cannot
 * be read — "nobody clicked the link", "clicked and bounced" and "no
 * demand" are three different results needing opposite responses. This
 * records the cheapest fact that separates them.
 *
 * WHAT IT DOES NOT DO. No third-party script, no user agent, no referrer,
 * no full path, no cookie, no cross-site anything. A salted SHA-256 of the
 * client IP and a two-value surface label, reusing the posture the rate
 * limiter established. Whether one person came back twice in a day is not
 * recorded, because the UNIQUE constraint collapses it — which is also how
 * "unique visits" stays a property of the schema rather than of a counting
 * query that can drift.
 *
 * Every failure path is silent by design: this is instrumentation, and
 * instrumentation must never take down the page it measures.
 */

export type ArrivalSurface = "feed" | "post";

/**
 * Crawlers, preview fetchers and uptime checks are not arrivals. Matching
 * on the UA is imperfect, but the failure mode is mild (a bot counted as a
 * person) and this catches the high-volume ones — including the messenger
 * previews this product's own distribution generates, which would
 * otherwise inflate the number every time a link is pasted.
 */
const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|embedly|quora|pinterest|vkshare|preview|scanner|monitor|uptime|curl|wget|headless|lighthouse|pagespeed|gtmetrix/i;

let warnedAboutSalt = false;

function visitorHash(ip: string): string {
  // Same salt as the rate limiter: one secret, one posture, and an IP
  // hashes identically in both places. Unsalted, an IPv4 hash is
  // reversible by brute force over the whole 2^32 space.
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt && !warnedAboutSalt) {
    warnedAboutSalt = true;
    console.warn(
      "[arrivals] RATE_LIMIT_SALT is not set. Arrivals are still counted, but " +
        "visitor hashes are unsalted and therefore reversible by brute force.",
    );
  }
  return createHash("sha256").update(`arrival:${salt ?? "ride4ride"}:${ip}`).digest("hex");
}

/**
 * Record one arrival. Safe to call on every render: the unique constraint
 * makes repeats a no-op, and every error is swallowed.
 *
 * Returns nothing on purpose — no caller should branch on whether
 * analytics succeeded.
 */
export async function recordArrival(
  surface: ArrivalSurface,
  userId?: string | null,
): Promise<void> {
  try {
    const h = await headers();

    const ua = h.get("user-agent") ?? "";
    if (BOT_RE.test(ua)) return;

    const xff = h.get("x-forwarded-for");
    const ip = (xff?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
    // No IP means no way to de-duplicate, and counting undeduplicated
    // traffic would inflate the gate. Better to undercount.
    if (!ip) return;

    const admin = createAdminClient();
    const { error } = await admin.from("arrival_events").insert({
      surface,
      visitor_hash: visitorHash(ip),
      user_id: userId ?? null,
    });

    // 23505 is the unique violation, i.e. this visitor already arrived on
    // this surface today. That is the mechanism working, not a failure.
    if (error && error.code !== "23505") {
      console.error("[arrivals] insert failed:", error.message, error.code);
    }
  } catch (err) {
    console.error("[arrivals] threw:", err);
  }
}
