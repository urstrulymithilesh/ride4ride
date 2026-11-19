import { describe, expect, it } from "vitest";
import {
  abbreviateStreet,
  formatActiveAgo,
  formatAge,
  formatDistance,
  formatJoined,
  formatPlace,
  formatRideWhen,
} from "@/lib/utils/format";
import {
  addDays,
  formatMonthDay,
  todayInZone,
  timezoneForState,
} from "@/lib/pickup-tz";

describe("formatDistance", () => {
  it("returns null for null/undefined", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
  });

  it("shows one decimal under 10 miles", () => {
    // 3218m ≈ 2.0 mi
    expect(formatDistance(3218)).toBe("2.0 mi");
  });

  it("rounds to whole miles at 10+", () => {
    // 92000m ≈ 57.2 mi
    expect(formatDistance(92000)).toBe("57 mi");
  });
});

describe("formatPlace", () => {
  it("joins city and state", () => {
    expect(formatPlace("Riverside", "CA")).toBe("Riverside, CA");
  });

  it("appends zip when present", () => {
    expect(formatPlace("Riverside", "CA", "92521")).toBe("Riverside, CA 92521");
  });
});

describe("abbreviateStreet", () => {
  it("shortens trailing suffixes", () => {
    expect(abbreviateStreet("Newberry Court")).toBe("Newberry Ct");
    expect(abbreviateStreet("East New York Street")).toBe("East New York St");
    expect(abbreviateStreet("Bromley Lane")).toBe("Bromley Ln");
    expect(abbreviateStreet("Station Boulevard")).toBe("Station Blvd");
    expect(abbreviateStreet("Modaff Road")).toBe("Modaff Rd");
    expect(abbreviateStreet("Royal Saint George Drive")).toBe(
      "Royal Saint George Dr",
    );
  });
  it("leaves names and nulls alone", () => {
    expect(abbreviateStreet("Main")).toBe("Main");
    expect(abbreviateStreet("Park Glen")).toBe("Park Glen");
    expect(abbreviateStreet(null)).toBeNull();
  });
});

describe("profile header", () => {
  it("computes whole-year ages", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    expect(formatAge("2002-11-19", now)).toBe(24);
    expect(formatAge("2002-11-20", now)).toBe(23);
    expect(formatAge(null, now)).toBeNull();
    expect(formatAge("not-a-date", now)).toBeNull();
  });
  it("renders joined month", () => {
    expect(formatJoined("2026-11-02T10:00:00Z")).toBe("Nov 2026");
    expect(formatJoined("garbage")).toBe("");
  });
  it("renders capitalized activity recency", () => {
    const now = new Date("2026-11-19T12:00:00Z").getTime();
    expect(
      formatActiveAgo(new Date(now - 55 * 60000).toISOString(), now),
    ).toBe("55 Minutes ago");
    expect(
      formatActiveAgo(new Date(now - 60 * 60000).toISOString(), now),
    ).toBe("1 Hour ago");
    expect(
      formatActiveAgo(new Date(now - 5 * 86400000).toISOString(), now),
    ).toBe("5 Days ago");
    expect(formatActiveAgo(null, now)).toBeNull();
  });
});

describe("formatRideWhen", () => {
  it("labels dateless and past rides today", () => {
    expect(formatRideWhen(null, "IL")).toBe("Today");
    expect(formatRideWhen("2020-01-01", "IL")).toBe("Today");
  });

  it("labels tomorrow and later dates", () => {
    const today = todayInZone(timezoneForState("IL"));
    expect(formatRideWhen(addDays(today, 1), "IL")).toBe("Tomorrow");
    expect(formatRideWhen(addDays(today, 5), "IL")).toBe(
      formatMonthDay(addDays(today, 5)),
    );
  });
});
