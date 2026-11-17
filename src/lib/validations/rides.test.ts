import { describe, expect, it } from "vitest";
import {
  parseDateFields,
  parseRideTiming,
  resolvePostDate,
  validateGet,
  validateOffer,
} from "@/lib/validations/rides";

// Fixed "now" for date math: 2026-11-18 12:00 UTC (a Wednesday).
const NOW = new Date("2026-11-18T12:00:00Z");

describe("parseDateFields", () => {
  it("defaults to today", () => {
    const r = parseDateFields("", "");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ date_option: "today", custom_date: "" });
    }
  });

  it("accepts tomorrow without a custom date", () => {
    const r = parseDateFields("tomorrow", "");
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown option", () => {
    const r = parseDateFields("someday", "");
    expect(r.ok).toBe(false);
  });

  it("rejects a custom option without a valid date", () => {
    expect(parseDateFields("custom", "").ok).toBe(false);
    expect(parseDateFields("custom", "11/20/2026").ok).toBe(false);
    expect(parseDateFields("custom", "2026-02-30").ok).toBe(false);
    expect(
      parseDateFields("custom", "2026-11-20").ok,
    ).toBe(true);
  });
});

describe("resolvePostDate", () => {
  // Illinois -> America/Chicago. 2026-11-18 12:00Z is 06:00 CST, same day.
  it("resolves today and tomorrow in the pickup zone", () => {
    expect(
      resolvePostDate(
        { date_option: "today", custom_date: "", time_mode: "asap" },
        "IL",
        NOW,
      ),
    ).toEqual({ ok: true, data: { ride_date: "2026-11-18" } });
    expect(
      resolvePostDate(
        { date_option: "tomorrow", custom_date: "", time_mode: "anytime" },
        "IL",
        NOW,
      ),
    ).toEqual({ ok: true, data: { ride_date: "2026-11-19" } });
  });

  it("rejects custom dates on or before tomorrow", () => {
    const draft = {
      date_option: "custom" as const,
      custom_date: "",
      time_mode: "anytime" as const,
    };
    expect(
      resolvePostDate({ ...draft, custom_date: "2026-11-19" }, "IL", NOW).ok,
    ).toBe(false);
    expect(
      resolvePostDate({ ...draft, custom_date: "2020-01-01" }, "IL", NOW).ok,
    ).toBe(false);
    expect(
      resolvePostDate({ ...draft, custom_date: "2026-11-20" }, "IL", NOW),
    ).toEqual({ ok: true, data: { ride_date: "2026-11-20" } });
  });

  it("rejects now for future dates", () => {
    const r = resolvePostDate(
      { date_option: "tomorrow", custom_date: "", time_mode: "asap" },
      "IL",
      NOW,
    );
    expect(r.ok).toBe(false);
  });

  it("uses the pickup zone across midnight UTC", () => {
    // 04:00 UTC Nov 18 is still Nov 17 in Chicago.
    const night = new Date("2026-11-18T04:00:00Z");
    expect(
      resolvePostDate(
        { date_option: "today", custom_date: "", time_mode: "asap" },
        "IL",
        night,
      ),
    ).toEqual({ ok: true, data: { ride_date: "2026-11-17" } });
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
    date_option: "today",
    custom_date: "",
  };

  it("accepts a minimal valid offer", () => {
    expect(validateOffer({ ...base }).ok).toBe(true);
  });

  it("upper-cases a valid airport tag", () => {
    const r = validateOffer({ ...base, from_airport: "ord" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.from_airport).toBe("ORD");
  });

  it("rejects a malformed airport tag", () => {
    const r = validateOffer({ ...base, from_airport: "ohare" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.from_airport).toBeDefined();
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
    date_option: "today",
    custom_date: "",
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
