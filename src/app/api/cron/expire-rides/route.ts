import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron, PRE_EXPIRY_NOTICE_MS } from "@/lib/cron";
import { sendPushToUser } from "@/lib/push";
import { formatPlace } from "@/lib/utils/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Two jobs in one pass:
 *   1. Pre-expiry push: for active posts expiring within the notice window
 *      and not yet notified, push the owner and mark expiry_notified_at.
 *   2. Expire: flip active posts whose expires_at has passed to 'expired'.
 *
 * Scheduled via vercel.json. The cron interval should be <= the notice
 * window (default 1h) so soon-to-expire posts aren't missed.
 *
 * FAILURE POLICY. This job is what actually enforces the 7-day expiry
 * rule (see 0008_expiry_hardening.sql). Previously both queries here
 * discarded their `error`, so a failed run returned
 * `{ notified: 0, expired: 0 }` with HTTP 200 — which Vercel Cron records
 * as a SUCCESS. Posts would have stopped expiring indefinitely and the
 * only symptom would be eventually noticing a stale post by eye.
 *
 * So: every query error is logged and the route returns HTTP 500. A cron
 * run that did not do its job must look like a failed run.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowIso = new Date(now + PRE_EXPIRY_NOTICE_MS).toISOString();
  const failures: string[] = [];

  // --- 1) Pre-expiry notifications -------------------------------------
  const { data: soon, error: soonError } = await admin
    .from("rides")
    .select("id, owner_id, from_city, from_state, to_city, to_state")
    .eq("status", "active")
    .is("expiry_notified_at", null)
    .gt("expires_at", nowIso) // not already past due
    .lte("expires_at", windowIso); // within the notice window

  if (soonError) {
    console.error("[cron/expire-rides] pre-expiry select failed:", soonError.message, soonError);
    failures.push(`pre-expiry select: ${soonError.message}`);
  }

  let notified = 0;
  let markFailures = 0;
  for (const ride of soon ?? []) {
    try {
      const count = await sendPushToUser(ride.owner_id, {
        title: "Your ride post is about to expire",
        body: `${formatPlace(ride.from_city, ride.from_state)} → ${formatPlace(
          ride.to_city,
          ride.to_state,
        )} expires soon. Repost to keep it live.`,
        url: `/rides/${ride.id}`,
        tag: `expiry-${ride.id}`,
      });
      if (count > 0) notified += 1;
    } catch {
      // Don't let one failed push stop the batch.
    }
    // Mark as notified regardless, so we don't retry every run. A failure
    // here is not fatal (worst case the owner is notified twice) but it
    // must not be invisible.
    const { error: markError } = await admin
      .from("rides")
      .update({ expiry_notified_at: nowIso })
      .eq("id", ride.id);
    if (markError) {
      console.error(
        `[cron/expire-rides] marking expiry_notified_at failed for ride ${ride.id}:`,
        markError.message,
      );
      markFailures += 1;
    }
  }
  if (markFailures > 0) failures.push(`expiry_notified_at updates failed: ${markFailures}`);

  // --- 2) Expire past-due posts ----------------------------------------
  // The load-bearing step. If this fails silently, the 7-day rule stops
  // being enforced and nothing anywhere says so.
  const { data: expired, error: expiredError } = await admin
    .from("rides")
    .update({ status: "expired" })
    .eq("status", "active")
    .lte("expires_at", nowIso)
    .select("id");

  if (expiredError) {
    console.error("[cron/expire-rides] EXPIRY UPDATE FAILED:", expiredError.message, expiredError);
    failures.push(`expiry update: ${expiredError.message}`);
  }

  const body = {
    notified,
    expired: expired?.length ?? 0,
    ...(failures.length > 0 ? { failures } : {}),
  };

  // A run that did not do its job must not report 200.
  return NextResponse.json(body, { status: failures.length > 0 ? 500 : 200 });
}
