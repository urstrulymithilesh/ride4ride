import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push (VAPID) send helpers, SERVER-ONLY.
 *
 * VAPID keys identify this app server to the push services. Generate once:
 *   npx web-push generate-vapid-keys
 * and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (public one also exposed as
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY for the browser subscription call).
 */

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@ride4ride.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured (see .env.local.example).");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push to every subscription belonging to a user. Prunes
 * subscriptions the push service reports as gone (404/410). Returns the
 * number of successful sends. Uses the admin client (RLS bypass).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  ensureConfigured();
  const admin = createAdminClient();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired/unsubscribed — remove it.
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );

  return sent;
}
