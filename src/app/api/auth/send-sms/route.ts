import { NextResponse } from "next/server";
import {
  buildOtpMessage,
  extractOtpSms,
  sendViaTextBee,
  verifyHookSignature,
} from "@/lib/sms-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase Auth "Send SMS" hook target (TextBee bridge).
 *
 * Supabase has no native textbee.dev provider, so the dashboard hook
 * points here: Auth POSTs { user, sms: { otp } }, signed per the Standard
 * Webhooks spec, and we forward the OTP to the gateway phone via
 * textbee's REST API.
 *
 * Security: authenticity comes from the signature, verified against
 * SMS_HOOK_SECRET (the dashboard hook's `v1,whsec_…` value — NOT a
 * custom header). Without the env var set, or on any mismatch, this
 * fails closed — an open SMS relay would let anyone burn the textbee
 * plan.
 */
export async function POST(request: Request) {
  const hookSecret = process.env.SMS_HOOK_SECRET;
  if (!hookSecret) {
    console.error("[sms] SMS_HOOK_SECRET is not set — refusing to relay.");
    return NextResponse.json({ error: "sms not configured" }, { status: 500 });
  }
  const rawBody = await request.text();
  const verified = verifyHookSignature({
    rawBody,
    webhookId: request.headers.get("webhook-id"),
    webhookTimestamp: request.headers.get("webhook-timestamp"),
    webhookSignature: request.headers.get("webhook-signature"),
    secret: hookSecret,
  });
  if (!verified) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const sms = extractOtpSms(body);
  if (!sms) {
    console.error("[sms] malformed hook payload");
    return NextResponse.json({ error: "bad hook payload" }, { status: 400 });
  }

  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) {
    console.error("[sms] TEXTBEE_API_KEY is not set.");
    return NextResponse.json({ error: "sms not configured" }, { status: 500 });
  }

  const result = await sendViaTextBee({
    phone: sms.phone,
    message: buildOtpMessage(sms.otp),
    apiKey,
    deviceId: process.env.TEXTBEE_DEVICE_ID || undefined,
  });
  if (!result.ok) {
    console.error("[sms] textbee rejected the send:", result.status, result.body);
    return NextResponse.json({ error: "sms send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
