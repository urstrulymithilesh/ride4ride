import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  validateSignIn,
  validateSignUp,
} from "@/lib/validations/auth";

const base = {
  phone: "(312) 555-0148",
  email: "",
  password: "password123",
  displayName: "Alex Rivera",
  username: "alex_r123",
  gender: "male",
  ageConfirmed18: true,
  tosAccepted: true,
};

describe("normalizePhone", () => {
  it("normalizes US formats to E.164", () => {
    expect(normalizePhone("(312) 555-0148")).toBe("+13125550148");
    expect(normalizePhone("312-555-0148")).toBe("+13125550148");
    expect(normalizePhone("3125550148")).toBe("+13125550148");
    expect(normalizePhone("13125550148")).toBe("+13125550148");
  });
  it("passes explicit international numbers through", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects non-numbers", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("555-0148")).toBeNull();
    expect(normalizePhone("not a number")).toBeNull();
    expect(normalizePhone("312555014812345678")).toBeNull();
  });
});

describe("validateSignUp", () => {
  it("accepts a phone-only signup (email skipped)", () => {
    const r = validateSignUp(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.phone).toBe("+13125550148");
      expect(r.data.email).toBeNull();
    }
  });
  it("accepts a signup with an email", () => {
    const r = validateSignUp({ ...base, email: "You@Gmail.COM " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe("you@gmail.com");
  });
  it("rejects a bad phone and a bad email", () => {
    const r = validateSignUp({ ...base, phone: "123", email: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.phone).toBeTruthy();
      expect(r.fieldErrors.email).toBeTruthy();
    }
  });

  it("requires male or female", () => {
    expect(validateSignUp({ ...base, gender: "" }).ok).toBe(false);
    expect(validateSignUp({ ...base, gender: "other" }).ok).toBe(false);
    const r = validateSignUp({ ...base, gender: "Female" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.gender).toBe("female");
  });
});

describe("validateSignIn", () => {
  it("accepts a phone number as E.164", () => {
    const r = validateSignIn({ identifier: "(312) 555-0148", password: "x" });
    expect(r).toEqual({
      ok: true,
      data: { kind: "phone", value: "+13125550148", password: "x" },
    });
  });
  it("accepts a username, lowercased", () => {
    const r = validateSignIn({ identifier: "Alex_R123", password: "x" });
    expect(r).toEqual({
      ok: true,
      data: { kind: "username", value: "alex_r123", password: "x" },
    });
  });
  it("rejects emails, garbage, and empty passwords", () => {
    expect(validateSignIn({ identifier: "you@gmail.com", password: "x" }).ok).toBe(
      false,
    );
    expect(validateSignIn({ identifier: "???", password: "x" }).ok).toBe(false);
    expect(validateSignIn({ identifier: "alex_r123", password: "" }).ok).toBe(
      false,
    );
  });
});
