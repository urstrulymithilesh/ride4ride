import { describe, expect, it } from "vitest";
import { searchPlaces } from "./places";

describe("searchPlaces (vendored datasets)", () => {
  it("finds Naperville, IL by prefix", () => {
    const res = searchPlaces("naperv", "city");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].title).toBe("Naperville, IL");
    expect(res[0].kind).toBe("city");
  });

  it("ranks exact city above airfields for denton", () => {
    const res = searchPlaces("denton", ["city", "airport"]);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].kind).toBe("city");
    expect(res[0].title).toBe("Denton, TX");
  });

  it("ranks exact IATA code first", () => {
    const res = searchPlaces("ord", "airport");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].title).toBe("ORD");
    expect(res[0].value).toBe("Chicago, IL");
  });

  it("resolves university picks to their nearest city", () => {
    const res = searchPlaces("university of north texas", "university");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].title).toBe("University of North Texas");
    expect(res[0].value).toBe("Denton, TX");
  });

  it("finds university of west florida", () => {
    const res = searchPlaces("west florida", "university");
    expect(res.some((r) => r.title === "University of West Florida")).toBe(
      true,
    );
  });

  it("returns [] for short queries", () => {
    expect(searchPlaces("x", "all")).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(searchPlaces("ch", "all", 3)).toHaveLength(3);
  });
});
