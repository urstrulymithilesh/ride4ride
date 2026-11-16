/**
 * Pure geo helpers. Safe on both server and client — no browser or
 * filesystem APIs, so the feed can use the same math on both sides.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_METERS = 6_371_000;

/** Great-circle distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_METERS * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

/** Great-circle distance in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1609.344;
}

/** Stable 32-bit FNV-1a hash. Used to spread approximate pins without
 *  ever deriving anything from a street address. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Move a city-center point a deterministic 0.35–1.5 miles in a random
 * direction. This is the Airbnb-style approximation: the pin is near the
 * pickup, never on it, and the same ride always lands in the same spot.
 */
export function approxPoint(base: LatLng, seed: string): LatLng {
  const h = hashString(seed);
  const angle = ((h >>> 0) / 4294967296) * Math.PI * 2;
  const radiusMiles = 0.35 + ((h >>> 12) % 1000) / 1000 * 1.15;
  const dLat = (radiusMiles / 69) * Math.cos(angle);
  const cosLat = Math.cos((base.lat * Math.PI) / 180) || 1;
  const dLng = (radiusMiles / (69 * cosLat)) * Math.sin(angle);
  return {
    lat: Number((base.lat + dLat).toFixed(6)),
    lng: Number((base.lng + dLng).toFixed(6)),
  };
}

/**
 * Near-pickup pin: the exact geocoded point moved a deterministic
 * 0.01–0.05 miles in a pseudo-random direction. Reads as on the pickup
 * at every zoom the feed allows, while the stored point is still never
 * exactly the address. Same seed always lands in the same spot. The exact
 * point is never stored publicly — only this pre-jittered pin.
 */
export function nearPickup(base: LatLng, seed: string): LatLng {
  const h = hashString(`near-pickup|${seed}`);
  const angle = (h / 4294967296) * Math.PI * 2;
  const radiusMiles = 0.01 + (((h >>> 11) % 1000) / 1000) * 0.04;
  const dLat = (radiusMiles / 69) * Math.cos(angle);
  const cosLat = Math.cos((base.lat * Math.PI) / 180) || 1;
  const dLng = (radiusMiles / (69 * cosLat)) * Math.sin(angle);
  return {
    lat: Number((base.lat + dLat).toFixed(6)),
    lng: Number((base.lng + dLng).toFixed(6)),
  };
}
