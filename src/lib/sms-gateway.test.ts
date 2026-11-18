import { describe, expect, it, vi } from "vitest";
import {
  buildOtpMessage,
  extractOtpSms,
  sendViaTextBee,
  verifyHookSignature,
} from "@/lib/sms-gateway";

describe("extractOtpSms", () => {
  it("pulls the otp and prefers sms.phone", () => {
    expect(
      extractOtpSms({
        user: { id: "u1", phone: "+1999" },
        sms: { otp: "123456", phone: "+13125550148" },
      }),
    ).toEqual({ otp: "123456", phone: "+13125550148" });
  });
  it("falls back to user.phone (the documented shape)", () => {
    expect(
      extractOtpSms({
        user: { id: "u1", phone: "+13125550148" },
        sms: { otp: "123456" },
      }),
    ).toEqual({ otp: "123456", phone: "+13125550148" });
  });
  it("rejects malformed payloads", () => {
    expect(extractOtpSms(null)).toBeNull();
    expect(extractOtpSms({})).toBeNull();
    expect(extractOtpSms({ sms: { otp: "", phone: "+1" } })).toBeNull();
    expect(extractOtpSms({ sms: { otp: "1" } })).toBeNull();
    expect(
      extractOtpSms({ user: {}, sms: { otp: "123456" } }),
    ).toBeNull();
  });
});

describe("buildOtpMessage", () => {
  it("is plain ASCII (single GSM-7 segment)", () => {
    const m = buildOtpMessage("123456");
    expect(m).toBe("Your ride4ride code is 123456");
    expect(/^[\x00-\x7F]*$/.test(m)).toBe(true);
  });
});

describe("verifyHookSignature", () => {
  const secret = "v1,whsec_dGVzdC1zZWNyZXQtMzItYnl0ZXMtbG9uZyEh";
  const rawBody =
    '{"user":{"phone":"+13125550148"},"sms":{"otp":"123456"}}';
  const good = {
    rawBody,
    webhookId: "msg_test123",
    webhookTimestamp: "1700000000",
    webhookSignature: "v1,7GWz34DjKWysBRaXYREMGDmN2BenHnGdhpfq6ChWuH4=",
    secret,
  };
  it("accepts a correctly signed call", () => {
    expect(verifyHookSignature(good)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets, and missing headers", () => {
    expect(verifyHookSignature({ ...good, rawBody: rawBody + " " })).toBe(
      false,
    );
    expect(
      verifyHookSignature({ ...good, secret: "v1,whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    ).toBe(false);
    expect(verifyHookSignature({ ...good, webhookId: null })).toBe(false);
    expect(verifyHookSignature({ ...good, secret: "not-a-secret" })).toBe(
      false,
    );
  });
});

describe("sendViaTextBee", () => {
  it("posts recipients + message with the api key", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await sendViaTextBee({
      phone: "+13125550148",
      message: "hi",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("api.textbee.dev");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(JSON.parse(init.body as string)).toEqual({
      recipients: ["+13125550148"],
      message: "hi",
    });
  });
  it("surfaces gateway failures with status", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("no device", { status: 400 }),
    );
    const r = await sendViaTextBee({
      phone: "+13125550148",
      message: "hi",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: false, status: 400, body: "no device" });
  });
});
