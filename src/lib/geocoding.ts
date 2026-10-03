import "server-only";

/**
 * Mapbox geocoding + driving-distance, SERVER-ONLY.
 *
 * The `server-only` import above makes the build fail if this module is ever
 * imported into a Client Component, guaranteeing MAPBOX_ACCESS_TOKEN never
 * reaches the browser. Use only from Server Actions / Route Handlers.
 */

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

export interface GeocodeResult {
  lat: number;
  lng: number;
  city: string | null;
  state: string | null; // 2-letter, e.g. "CA"
  zip: string | null;
  placeName: string;
  /**
   * PUBLIC masked street name (e.g. "Main St") — never a house number.
   * Null unless the match is a street address. Stored on `rides.from_street`
   * / `to_street`, which are world-readable by design (v3 pilot asymmetry
   * table), so this must stay number-free. The full address stays in
   * row-protected `ride_locations`.
   */
  street: string | null;
}

function requireToken(): string {
  if (!TOKEN) {
    throw new Error(
      "MAPBOX_ACCESS_TOKEN is not set. Add it to .env.local (server-only, no NEXT_PUBLIC_ prefix).",
    );
  }
  return TOKEN;
}

/** Geocode a free-form US address to coordinates + coarse city/state/zip. */
export async function geocodeAddress(
  query: string,
): Promise<GeocodeResult | null> {
  const token = requireToken();
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&limit=1&country=us&types=address,poi,place,neighborhood`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{
      center: [number, number];
      place_name: string;
      text?: string;
      address?: string; // house number, e.g. "123" — NEVER stored publicly
      place_type?: string[];
      context?: Array<{ id: string; text: string; short_code?: string }>;
    }>;
  };

  const f = data.features?.[0];
  if (!f) return null;

  const [lng, lat] = f.center;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  for (const c of f.context ?? []) {
    if (c.id.startsWith("postcode")) zip = c.text;
    else if (c.id.startsWith("place")) city = c.text;
    else if (c.id.startsWith("region"))
      state = c.short_code?.replace(/^us-/i, "").toUpperCase() ?? c.text;
  }
  // If the matched feature is itself a place, use its name as the city.
  if (!city && f.place_type?.includes("place")) city = f.text ?? null;

  return { lat, lng, city, state, zip, placeName: f.place_name, street: maskedStreet(f) };
}

/**
 * Masked street name for public display: the street NAME without any house
 * number. Mapbox puts the number in `address` and the name in `text` for
 * `address`-type matches, but the leading-digit strip below is a second
 * barrier so a provider shape change can never promote a house number onto
 * the public `rides.from_street` / `to_street` columns. Non-address matches
 * (POI, neighborhood, place) yield null — no street to mask.
 */
function maskedStreet(f: { text?: string; place_type?: string[] }): string | null {
  if (!f.place_type?.includes("address")) return null;
  const name = (f.text ?? "").replace(/^\d+\s+/, "").trim();
  if (!name) return null;
  return name.slice(0, 80);
}

/** Straight-line distance (meters) — fallback when Directions is unavailable. */
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

/** Driving distance in meters between two points; falls back to straight-line. */
export async function drivingDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number> {
  const token = requireToken();
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?access_token=${token}&overview=false`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: Array<{ distance?: number }>;
      };
      const d = data.routes?.[0]?.distance;
      if (typeof d === "number") return Math.round(d);
    }
  } catch {
    // fall through to straight-line
  }
  return haversineMeters(from, to);
}
