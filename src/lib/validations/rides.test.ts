import { describe, expect, it } from "vitest";
import {
  parseRideTiming,
  parseTiming,
  validateGet,
  validateOffer,
} from "@/lib/validations/rides";

const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

describe("parseTiming", () => {
  it("accepts a future ride with a future date", () => {
    const r = parseTiming("future", futureDate);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ is_future: true, ride_date: futureDate });
    }
  });

  it("rejects a future ride without a date", () => {
    const r = parseTiming("future", "");
    expect(r.ok).toBe(false);
  });

  it("rejects a future ride with a past date", () => {
    const r = parseTiming("future", "2020-01-01");
    expect(r.ok).toBe(false);
  });

  it("accepts a current ride with no date", () => {
    const r = parseTiming("current", "");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ is_future: false, ride_date: null });
    }
  });

  it("accepts a current ride carrying an optional date", () => {
    const r = parseTiming("current", futureDate);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ is_future: false, ride_date: futureDate });
    }
  });
});

describe("parseRideTiming", () => {
  it("defaults to asap", () => {
    const r = parseRideTiming("", "");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ time_mode: "asap", ride_time: null });
    }
  });

  it("accepts anytime", () => {
    const r = parseRideTiming("anytime", "");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ time_mode: "anytime", ride_time: null });
    }
  });

  it("accepts a specific time", () => {
    const r = parseRideTiming("at", "10:30");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ time_mode: "at", ride_time: "10:30" });
    }
  });

  it("rejects specific time without a time", () => {
    const r = parseRideTiming("at", "");
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed time", () => {
    const r = parseRideTiming("at", "25:99");
    expect(r.ok).toBe(false);
  });
});

describe("validateOffer", () => {
  const base = {
    from_city: "Chicago",
    from_state: "IL",
    from_zip: "",
    to_city: "Aurora",
    to_state: "IL",
    to_zip: "",
    description: "",
    mode: "current",
    ride_date: "",
  };

  it("accepts a minimal valid offer", () => {
    expect(validateOffer({ ...base }).ok).toBe(true);
  });

  it("requires both cities and states", () => {
    const r = validateOffer({ ...base, from_city: "", to_state: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.from_city).toBeDefined();
      expect(r.fieldErrors.to_state).toBeDefined();
    }
  });
});

describe("validateGet", () => {
  const base = {
    from_address: "3296 Bromley Ln, Aurora, IL 60502",
    to_address: "1014 Bradford Dr, Naperville, IL 60563",
    description: "",
    mode: "current",
    ride_date: "",
  };

  it("accepts full addresses", () => {
    expect(validateGet({ ...base }).ok).toBe(true);
  });

  it("rejects stub addresses", () => {
    const r = validateGet({ ...base, from_address: "12" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.from_address).toBeDefined();
  });
});
