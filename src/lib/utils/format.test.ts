import { describe, expect, it } from "vitest";
import {
  formatDistance,
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
