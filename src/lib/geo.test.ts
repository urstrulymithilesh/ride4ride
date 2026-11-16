import { describe, expect, it } from "vitest";
import { approxPoint, haversineMiles, nearPickup } from "./geo";

describe("geo helpers", () => {
  it("measures Chicago to New York as roughly 712 miles", () => {
    const d = haversineMiles(
      { lat: 41.8781, lng: -87.6298 },
      { lat: 40.7128, lng: -74.006 },
    );
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(725);
  });

  it("keeps approximate pins within ~1.5 miles of the city center", () => {
    const center = { lat: 41.8781, lng: -87.6298 };
    for (let i = 0; i < 200; i++) {
      const pin = approxPoint(center, `ride-${i}`);
      expect(haversineMiles(center, pin)).toBeLessThanOrEqual(1.6);
    }
  });

  it("is deterministic for the same ride id", () => {
    const center = { lat: 34.0522, lng: -118.2437 };
    expect(approxPoint(center, "abc")).toEqual(approxPoint(center, "abc"));
  });

  it("spreads different ride ids to different points", () => {
    const center = { lat: 34.0522, lng: -118.2437 };
    expect(approxPoint(center, "abc")).not.toEqual(
      approxPoint(center, "def"),
    );
  });

  it("keeps near-pickup pins within 0.01–0.05 miles of the exact point", () => {
    const pickup = { lat: 41.76058, lng: -88.32007 };
    for (let i = 0; i < 200; i++) {
      const pin = nearPickup(pickup, `ride-${i}`);
      const d = haversineMiles(pickup, pin);
      expect(d).toBeGreaterThanOrEqual(0.008);
      expect(d).toBeLessThanOrEqual(0.06);
    }
  });

  it("never lands exactly on the pickup", () => {
    const pickup = { lat: 41.76058, lng: -88.32007 };
    for (let i = 0; i < 50; i++) {
      expect(nearPickup(pickup, `ride-${i}`)).not.toEqual(pickup);
    }
  });

  it("is deterministic for the same seed", () => {
    const pickup = { lat: 41.76058, lng: -88.32007 };
    expect(nearPickup(pickup, "abc")).toEqual(nearPickup(pickup, "abc"));
  });
});
