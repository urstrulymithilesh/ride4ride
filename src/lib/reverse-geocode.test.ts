import { describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "@/lib/reverse-geocode";

const feature = (over: Record<string, unknown> = {}) => ({
  text: "Arlington",
  place_type: ["place"],
  center: [-97.1, 32.73] as [number, number],
  context: [
    { id: "place.1", text: "Arlington" },
    { id: "region.1", text: "Texas", short_code: "us-tx" },
    { id: "country.1", text: "United States", short_code: "us" },
  ],
  ...over,
});

const okFetch = (features: unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ features }), { status: 200 }));

describe("reverseGeocode", () => {
  it("returns city + state from context", async () => {
    const fetchImpl = okFetch([feature()]);
    const r = await reverseGeocode(
      32.73, -97.1, "key",
      fetchImpl as unknown as typeof fetch,
    );
    expect(r).toEqual({ city: "Arlington", state: "TX" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("-97.1,32.73");
  });
  it("returns null on bad input, failures, and missing locality", async () => {
    const empty = okFetch([]);
    expect(await reverseGeocode(NaN, 0, "k", empty as unknown as typeof fetch)).toBeNull();
    expect(await reverseGeocode(0, 0, "k", empty as unknown as typeof fetch)).toBeNull();
    expect(await reverseGeocode(0, 0, "", empty as unknown as typeof fetch)).toBeNull();
    const fail = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await reverseGeocode(0, 0, "k", fail as unknown as typeof fetch)).toBeNull();
  });
});
