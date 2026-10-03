import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatPlace,
  formatRideWhen,
} from "@/lib/utils/format";

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
  it("labels dateless rides ASAP", () => {
    expect(formatRideWhen(null, false)).toBe("current · asap");
  });

  it("renders a dated future ride with year and month", () => {
    const label = formatRideWhen("2026-09-10", true);
    expect(label).toContain("2026");
    expect(label).toContain("Sep");
  });

  it("prefixes a dated current ride with current", () => {
    expect(formatRideWhen("2026-09-10", false).startsWith("current · ")).toBe(
      true,
    );
  });
});
