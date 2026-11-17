import { describe, expect, it } from "vitest";
import {
  addDays,
  formatMonthDay,
  timezoneForState,
  todayInZone,
} from "./pickup-tz";

describe("timezoneForState", () => {
  it("maps core states", () => {
    expect(timezoneForState("IL")).toBe("America/Chicago");
    expect(timezoneForState("il")).toBe("America/Chicago");
    expect(timezoneForState("NY")).toBe("America/New_York");
    expect(timezoneForState("CA")).toBe("America/Los_Angeles");
  });
  it("uses majority sides for split states and Phoenix for Arizona", () => {
    expect(timezoneForState("FL")).toBe("America/New_York");
    expect(timezoneForState("TN")).toBe("America/Chicago");
    expect(timezoneForState("AZ")).toBe("America/Phoenix");
  });
  it("falls back to UTC for unknown states", () => {
    expect(timezoneForState("")).toBe("UTC");
    expect(timezoneForState("XX")).toBe("UTC");
  });
});

describe("todayInZone", () => {
  it("computes the calendar day per zone", () => {
    // 2026-11-18 04:00 UTC is still Nov 17 in Chicago (UTC-6).
    expect(todayInZone("America/Chicago", new Date("2026-11-18T04:00:00Z"))).toBe(
      "2026-11-17",
    );
    expect(todayInZone("UTC", new Date("2026-11-18T04:00:00Z"))).toBe(
      "2026-11-18",
    );
  });
});

describe("addDays", () => {
  it("rolls months and years", () => {
    expect(addDays("2026-11-18", 1)).toBe("2026-11-19");
    expect(addDays("2026-11-18", 2)).toBe("2026-11-20");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatMonthDay", () => {
  it("renders Mon DD with no year", () => {
    expect(formatMonthDay("2026-11-20")).toBe("Nov 20");
  });
});
