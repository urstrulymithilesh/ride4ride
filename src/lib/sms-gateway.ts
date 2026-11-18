import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * SMS OTP delivery via textbee.dev (Android-phone gateway, pilot stage).
 *
 * Supabase has no native textbee provider, so this is the bridge: the
 * Auth "Send SMS" hook POSTs the OTP here, and we forward it to textbee's
 * REST API, which pushes it to the gateway phone's SIM.
 *
 * Pure helpers (testable without network); the fetch itself lives in the
 * API route.
 */

/** Supabase Send-SMS hook payload, parsed defensively. The OTP always
 *  arrives in `sms.otp`; the number is usually `user.phone` (present in
 *  `sms.phone` only for phone-change flows), so both are accepted. */
export function extractOtpSms(
  body: unknown,
): { otp: string; phone: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as { sms?: unknown; user?: unknown };
  if (typeof root.sms !== "object" || root.sms === null) return null;
  const { otp, phone: smsPhone } = root.sms as {
    otp?: unknown;
    phone?: unknown;
  };
  if (typeof otp !== "string" || !otp) return null;
  const userPhone =
    typeof root.user === "object" && root.user !== null
      ? (root.user as { phone?: unknown }).phone
      : undefined;
  const phone =
    typeof smsPhone === "string" && smsPhone
      ? smsPhone
      : typeof userPhone === "string" && userPhone
        ? userPhone
        : null;
  if (!phone) return null;
  return { otp, phone };
}

/** Short GSM-7-only text (one segment, no UCS-2 surprise). */
export function buildOtpMessage(otp: string): string {
  return `Your ride4ride code is ${otp}`;
}

/**
 * Verify a Supabase HTTP-hook call (Standard Webhooks spec). Supabase
 * signs `${webhook-id}.${webhook-timestamp}.${rawBody}` with HMAC-SHA256
 * keyed by the base64 secret behind the dashboard's `v1,whsec_…` value,
 * and sends the result as `webhook-signature: v1,<base64>`. Rejects
 * anything else — including the absence of the headers.
 */
export function verifyHookSignature(input: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  /** Dashboard secret, full `v1,whsec_<base64>` form. */
  secret: string;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } =
    input;
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;
  const match = /^v1,whsec_([A-Za-z0-9+/=]+)$/.exec(secret.trim());
  if (!match) return false;
  const sig = /^v1,([A-Za-z0-9+/=]+)$/.exec(webhookSignature.trim());
  if (!sig) return false;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(
      createHmac("sha256", Buffer.from(match[1], "base64"))
        .update(`${webhookId}.${webhookTimestamp}.${rawBody}`, "utf8")
        .digest("base64"),
      "base64",
    );
    actual = Buffer.from(sig[1], "base64");
  } catch {
    return false;
  }
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export async function sendViaTextBee(input: {
  phone: string;
  message: string;
  apiKey: string;
  deviceId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const { phone, message, apiKey, deviceId, fetchImpl = fetch } = input;
  const res = await fetchImpl("https://api.textbee.dev/api/v1/gateway/send-sms", {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipients: [phone],
      message,
      ...(deviceId ? { deviceId } : {}),
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, body: await res.text() };
}
