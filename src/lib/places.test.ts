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
    expect(res[0].title).toBe("Chicago O'Hare International Airport (ORD)");
    expect(res[0].value).toBe("Chicago, IL");
  });

  it("resolves university picks to their nearest city", () => {
    const res = searchPlaces("university of north texas", "university");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].title).toBe("University of North Texas · Denton, TX");
    expect(res[0].value).toBe("Denton, TX");
  });

  it("finds university of west florida", () => {
    const res = searchPlaces("west florida", "university");
    expect(
      res.some((r) => r.title.startsWith("University of West Florida")),
    ).toBe(true);
  });

  it("returns [] for short queries", () => {
    expect(searchPlaces("x", "all")).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(searchPlaces("ch", "all", 3)).toHaveLength(3);
  });

  it("never returns duplicate kind/title/sub options", () => {
    // Regression: "la sierra" matched the same university row twice,
    // producing identical React keys downstream.
    const res = searchPlaces("la sierra", "all", 20);
    const ids = res.map((r) => `${r.kind}|${r.title}|${r.sub}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefers the curated city over coordinate derivation", () => {
    // Lewis University's Wikidata point sits nearer Lockport, but the
    // campus is in Romeoville, IL (Google) — curated in the dataset.
    const res = searchPlaces("lewis university", "university");
    const row = res.find((r) => r.title.startsWith("Lewis University"));
    expect(row?.title).toBe("Lewis University · Romeoville, IL");
    expect(row?.value).toBe("Romeoville, IL");
  });

  it("curates border-town campuses to their true city", () => {
    const ne = searchPlaces("northeastern university", "university").find(
      (r) => r.title.startsWith("Northeastern University"),
    );
    expect(ne?.title).toBe("Northeastern University · Boston, MA");
    const uwf = searchPlaces("university of west florida", "university").find(
      (r) => r.title.startsWith("University of West Florida"),
    );
    expect(uwf?.title).toBe("University of West Florida · Pensacola, FL");
  });

  it("lists wikidata-missing campuses from extras", () => {
    const fr = searchPlaces("franklin university", "university").find(
      (r) => r.title.startsWith("Franklin University"),
    );
    expect(fr?.title).toBe("Franklin University · Columbus, OH");
    const au = searchPlaces("aurora university", "university").find(
      (r) => r.title.startsWith("Aurora University"),
    );
    expect(au?.title).toBe("Aurora University · Aurora, IL");
  });
});
