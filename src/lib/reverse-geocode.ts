/**
 * Mapbox reverse-geocode for display ("City, ST" on the profile line).
 * Token-free on purpose: the caller (a Route Handler) supplies it, so
 * this module stays free of `server-only` and unit-testable — see
 * signup-count-query.ts for the house pattern.
 */

export interface ReverseFeature {
  text?: string;
  place_type?: string[];
  context?: Array<{ id: string; text: string; short_code?: string }>;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ city: string; state: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !apiKey) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${encodeURIComponent(apiKey)}&limit=1&country=us&types=place,locality,neighborhood`;
  let data: { features?: ReverseFeature[] };
  try {
    const res = await fetchImpl(url, { cache: "no-store" });
    if (!res.ok) return null;
    data = (await res.json()) as typeof data;
  } catch {
    return null;
  }
  const f = data.features?.[0];
  if (!f) return null;
  const ctx = (prefix: string) =>
    f.context?.find((c) => c.id.startsWith(prefix));
  const city =
    ctx("place")?.text ??
    ctx("locality")?.text ??
    ctx("neighborhood")?.text ??
    null;
  const region = ctx("region");
  const state =
    region?.short_code?.replace(/^us-/i, "").toUpperCase() ??
    region?.text ??
    null;
  if (!city || !state) return null;
  return { city, state };
}
