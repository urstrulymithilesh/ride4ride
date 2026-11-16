import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approxPoint, haversineMeters, type LatLng } from "@/lib/geo";
import { formatClockDots } from "@/lib/utils/format";
import type { MapRide } from "@/lib/ride-map";

/**
 * Approximate pickup points from the vendored US city dataset.
 *
 * The public `rides` table only carries city/state — exact addresses and
 * coordinates stay in the row-protected `ride_locations` table. So every
 * map pin is a CITY CENTER plus a deterministic ~1-mile jitter. That is
 * the Airbnb-style approximation: close enough to be useful, never the
 * poster's address.
 *
 * Server-only: reads the vendored dataset from disk.
 */

interface CityRow {
  name: string;
  ascii: string;
  lat: number;
  lon: number;
  region: string;
  pop: number;
}

interface CityIndex {
  byKey: Map<string, CityRow>;
  byState: Map<string, CityRow[]>;
  stateCenters: Map<string, LatLng>;
}

let index: CityIndex | null = null;

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function keyOf(name: string, region: string): string {
  return `${norm(name)}|${region.trim().toUpperCase()}`;
}

function getIndex(): CityIndex {
  if (index) return index;
  const rows = JSON.parse(
    readFileSync(join(process.cwd(), "data", "places", "cities.json"), "utf8"),
  ) as CityRow[];

  const byKey = new Map<string, CityRow>();
  const byState = new Map<string, CityRow[]>();
  for (const row of rows) {
    const region = row.region?.trim().toUpperCase();
    if (!region) continue;
    const key = keyOf(row.name, region);
    // Rows are population-sorted, so the first entry wins ties.
    if (!byKey.has(key)) byKey.set(key, row);
    const bucket = byState.get(region);
    if (bucket) bucket.push(row);
    else byState.set(region, [row]);
  }

  // Fallback when a city name doesn't match the dataset: the average of
  // the state's largest cities. Still city-level, still approximate.
  const stateCenters = new Map<string, LatLng>();
  for (const [region, bucket] of byState) {
    const top = bucket.slice(0, 12);
    const lat = top.reduce((sum, r) => sum + r.lat, 0) / top.length;
    const lng = top.reduce((sum, r) => sum + r.lon, 0) / top.length;
    stateCenters.set(region, { lat, lng });
  }

  index = { byKey, byState, stateCenters };
  return index;
}

/** City center from a city/state pair, with a state-level fallback. */
export function cityCenter(city: string, state: string): LatLng | null {
  const region = state.trim().toUpperCase();
  if (!region) return null;
  const idx = getIndex();
  const needle = norm(city);
  if (!needle) return idx.stateCenters.get(region) ?? null;

  const exact = idx.byKey.get(`${needle}|${region}`);
  if (exact) return { lat: exact.lat, lng: exact.lon };

  // Handle dataset variants ("St. Louis" vs "Saint Louis", "New York"
  // vs "New York City") by preferring the largest prefix match in-state.
  const bucket = idx.byState.get(region) ?? [];
  let best: CityRow | null = null;
  for (const row of bucket) {
    const name = norm(row.name);
    const ascii = norm(row.ascii);
    if (name === needle || ascii === needle) {
      return { lat: row.lat, lng: row.lon };
    }
    const prefixMatch =
      name.startsWith(needle) ||
      needle.startsWith(name) ||
      ascii.startsWith(needle) ||
      needle.startsWith(ascii);
    if (prefixMatch && (!best || row.pop > best.pop)) best = row;
  }
  if (best) return { lat: best.lat, lng: best.lon };

  return idx.stateCenters.get(region) ?? null;
}

const METERS_PER_MILE = 0.000621371;

/**
 * Pin labels always keep one decimal so a 15.8-mile trip reads "15.8
 * miles", not the rounded "16 miles" the shared card formatter uses.
 */
export function pinMiles(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  const miles = meters * METERS_PER_MILE;
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded.toFixed(1)} ${rounded === 1 ? "mile" : "miles"}`;
}

export interface RideGeoRow {
  id: string;
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  distance_meters: number | null;
  /** Public near-pickup pin (0022). Null until backfilled. */
  pin_lat?: number | null;
  pin_lng?: number | null;
  /** Pin timing suffix. Absent on pre-timing rows. */
  time_mode?: string | null;
  ride_time?: string | null;
}

/** Short timing for pin pills: "Now", "Anytime", or "10.45 a.m". */
export function pinWhen(
  time_mode: string | null | undefined,
  ride_time: string | null | undefined,
): string | null {
  if (time_mode === "at" && ride_time) return formatClockDots(ride_time);
  if (time_mode === "anytime") return "Anytime";
  if (time_mode === "asap") return "Now";
  return null;
}

/**
 * Map pins for `get` rides. The label is the trip distance, which the
 * database already computes from the exact addresses at post time. New
 * rows carry a pre-jittered near-pickup pin (close to the pickup, never
 * on it); rows from before 0022 fall back to the city-center pin.
 */
export function buildMapRides(rows: RideGeoRow[]): MapRide[] {
  return rows.flatMap((row) => {
    const from = cityCenter(row.from_city, row.from_state);
    if (!from) return [];
    const pin =
      row.pin_lat != null && row.pin_lng != null
        ? { lat: row.pin_lat, lng: row.pin_lng }
        : approxPoint(from, row.id);
    const miles = pinMiles(row.distance_meters) ?? (() => {
      const to = cityCenter(row.to_city, row.to_state);
      return to ? pinMiles(haversineMeters(from, to)) : null;
    })();
    // Pin pill reads "2.0 miles • Now" — distance plus timing.
    const when = pinWhen(row.time_mode, row.ride_time);
    const label = miles && when ? `${miles} • ${when}` : (miles ?? when);
    return [
      {
        id: row.id,
        lat: pin.lat,
        lng: pin.lng,
        miles: label,
        city: row.from_city,
        state: row.from_state,
      },
    ];
  });
}
