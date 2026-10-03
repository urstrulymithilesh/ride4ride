import { describe, expect, it } from "vitest";
import { maskedStreet } from "@/lib/masked-street";

/**
 * The privacy invariant in miniature: no house number may ever reach a
 * public column. The Mapbox `text` field normally carries the bare street
 * name, but these tests pin the defensive strip so a provider shape
 * change degrades to a masked name, never to a leaked number.
 */
describe("maskedStreet", () => {
  it("returns the street name for an address match", () => {
    expect(
      maskedStreet({ text: "Main St", place_type: ["address"] }),
    ).toBe("Main St");
  });

  it("strips a leading house number if one ever arrives in text", () => {
    expect(
      maskedStreet({ text: "3296 Bromley Ln", place_type: ["address"] }),
    ).toBe("Bromley Ln");
  });

  it("returns null for non-address matches", () => {
    expect(maskedStreet({ text: "Starbucks", place_type: ["poi"] })).toBeNull();
    expect(
      maskedStreet({ text: "Aurora", place_type: ["place"] }),
    ).toBeNull();
    expect(
      maskedStreet({ text: "Downtown", place_type: ["neighborhood"] }),
    ).toBeNull();
  });

  it("returns null when there is no usable name", () => {
    expect(maskedStreet({ text: "", place_type: ["address"] })).toBeNull();
    expect(maskedStreet({ place_type: ["address"] })).toBeNull();
    // A bare number with nothing after it can only be a house number
    // that lost its street — never publish it.
    expect(
      maskedStreet({ text: "3296", place_type: ["address"] }),
    ).toBeNull();
  });

  it("caps length at 80 characters", () => {
    const long = "A".repeat(200);
    expect(maskedStreet({ text: long, place_type: ["address"] })).toHaveLength(
      80,
    );
  });
});
