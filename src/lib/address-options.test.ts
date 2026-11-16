import { describe, expect, it } from "vitest";
import {
  addressOptionsFromMapbox,
  type MapboxAddressFeature,
} from "./address-options";

function feature(
  overrides: Partial<MapboxAddressFeature> = {},
): MapboxAddressFeature {
  return {
    place_name:
      "1014 Bradford Hicks Drive, Livingston, Tennessee 38570, United States",
    text: "Bradford Hicks Drive",
    address: "1014",
    place_type: ["address"],
    context: [
      { id: "postcode.1", text: "38570" },
      { id: "place.1", text: "Livingston" },
      { id: "region.1", text: "Tennessee", short_code: "US-TN" },
      { id: "country.1", text: "United States", short_code: "us" },
    ],
    ...overrides,
  };
}

describe("addressOptionsFromMapbox", () => {
  it("formats a street line, a city/state/country line, and a full fill value", () => {
    const [opt] = addressOptionsFromMapbox([feature()]);
    expect(opt).toEqual({
      kind: "address",
      title: "1014 Bradford Hicks Drive",
      sub: "Livingston, TN, USA",
      value:
        "1014 Bradford Hicks Drive, Livingston, Tennessee 38570, United States",
      fill: "1014 Bradford Hicks Drive, Livingston, Tennessee 38570, United States",
    });
  });

  it("does not print the house number twice", () => {
    const [opt] = addressOptionsFromMapbox([
      feature({ text: "1014 Bradford Hicks Drive" }),
    ]);
    expect(opt.title).toBe("1014 Bradford Hicks Drive");
  });

  it("carries provider coordinates for client-side proximity sorting", () => {
    const [opt] = addressOptionsFromMapbox([
      feature({ center: [-85.3, 36.4] }),
    ]);
    expect(opt.lat).toBe(36.4);
    expect(opt.lng).toBe(-85.3);
  });

  it("drops a bare street without a house number", () => {
    const results = addressOptionsFromMapbox([
      feature({ address: undefined, text: "Bradford Hicks Drive" }),
    ]);
    expect(results).toEqual([]);
  });

  it("keeps a numbered street when the number is in the text field", () => {
    const [opt] = addressOptionsFromMapbox([
      feature({ address: undefined, text: "1014 Bradford Hicks Drive" }),
    ]);
    expect(opt.title).toBe("1014 Bradford Hicks Drive");
  });

  it("filters out non-US features", () => {
    const results = addressOptionsFromMapbox([
      feature({
        place_name: "123 Rue Example, Montreal, Quebec, Canada",
        context: [
          { id: "place.1", text: "Montreal" },
          { id: "region.1", text: "Quebec", short_code: "CA-QC" },
          { id: "country.1", text: "Canada", short_code: "ca" },
        ],
      }),
    ]);
    expect(results).toEqual([]);
  });

  it("deduplicates identical place names and respects the limit", () => {
    const results = addressOptionsFromMapbox(
      [
        feature(),
        feature(),
        feature({
          place_name: "22 Main Street, Livingston, Tennessee 38570, United States",
          text: "Main Street",
          address: "22",
        }),
      ],
      2,
    );
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.title)).size).toBe(2);
  });

  it("falls back to the place name's first line when street fields are absent", () => {
    const [opt] = addressOptionsFromMapbox([
      feature({ address: undefined, text: undefined }),
    ]);
    expect(opt.title).toBe("1014 Bradford Hicks Drive");
  });

  it("uses USA when no context is present", () => {
    const [opt] = addressOptionsFromMapbox([
      feature({ context: [], place_name: "1014 Bradford Hicks Drive" }),
    ]);
    expect(opt.sub).toBe("USA");
    expect(opt.fill).toBe("1014 Bradford Hicks Drive");
  });

  it("ignores features without a usable title", () => {
    expect(
      addressOptionsFromMapbox([
        feature({ place_name: undefined, address: undefined, text: undefined }),
      ]),
    ).toEqual([]);
  });
});
