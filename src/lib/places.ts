import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PlaceKind = "city" | "airport" | "university";

export interface PlaceResult {
  kind: PlaceKind;
  /** Primary line, e.g. "Naperville, IL" or "ORD". */
  title: string;
  /** Secondary line, e.g. country or airport name. */
  sub: string;
  /** Machine-usable pick value, e.g. "Naperville, IL" or "Chicago, IL". */
  value: string;
  lat: number;
  lon: number;
}

interface CityRow {
  name: string;
  ascii: string;
  lat: number;
  lon: number;
  country: string;
  region: string;
  pop: number;
}

interface AirportRow {
  iata: string;
  name: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

interface UniversityRow {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

const cache = new Map<string, unknown[]>();

function loadFile(file: "airports.json" | "cities.json" | "universities.json"): string {
  // Static per-file paths (not join(cwd, dir, variable)) so bundlers trace
  // precisely the vendored dataset instead of the whole project.
  if (file === "airports.json")
    return join(process.cwd(), "data", "places", "airports.json");
  if (file === "cities.json")
    return join(process.cwd(), "data", "places", "cities.json");
  return join(process.cwd(), "data", "places", "universities.json");
}

function load<T>(file: "airports.json" | "cities.json" | "universities.json"): T[] {
  const hit = cache.get(file);
  if (hit) return hit as T[];
  const rows = JSON.parse(readFileSync(loadFile(file), "utf8")) as T[];
  cache.set(file, rows);
  return rows;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Nearest vendored city to a point (simple equirectangular distance). */
function nearestCity(lat: number, lon: number): CityRow | null {
  const cos = Math.cos((lat * Math.PI) / 180) || 1;
  let best: CityRow | null = null;
  let bestD = Infinity;
  for (const r of load<CityRow>("cities.json")) {
    const dx = (r.lon - lon) * cos;
    const dy = r.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** University picks resolve to their nearest city so the value stays
 *  feed-searchable ("University of North Texas" -> "Denton, TX"). */
function universityValue(r: UniversityRow): string {
  const near = nearestCity(r.lat, r.lon);
  if (!near) return r.name;
  return near.region ? `${near.name}, ${near.region}` : near.name;
}

/**
 * Prefix matches first, then substring matches. Cities break ties by
 * population (file is pre-sorted). Capped — this backs an autocomplete.
 * Server-only: reads vendored JSON from disk.
 */
export function searchPlaces(
  q: string,
  kind: PlaceKind | PlaceKind[] | "all" = "all",
  limit = 8,
): PlaceResult[] {
  const needle = norm(q.trim());
  if (needle.length < 2) return [];
  const kinds: PlaceKind[] =
    kind === "all" ? ["airport", "city", "university"] : Array.isArray(kind) ? kind : [kind];
  // Exact hits (IATA code, whole city name) outrank prefixes, which
  // outrank substring matches — so "denton" finds Denton, TX, not airfields.
  const exact: PlaceResult[] = [];
  const pref: PlaceResult[] = [];
  const sub: PlaceResult[] = [];
  const consider = (tier: "exact" | "pref" | "sub", r: PlaceResult) => {
    ({ exact, pref, sub })[tier].push(r);
  };
  // Stop scanning once all buckets are comfortably full; exact hits are
  // never skipped by an early exit (the bug that hid them).
  const full = () =>
    exact.length >= limit && pref.length >= limit && sub.length >= limit * 3;

  if (kinds.includes("airport")) {
    for (const r of load<AirportRow>("airports.json")) {
      if (full()) break;
      if (norm(r.iata) === needle) {
        consider("exact", {
          kind: "airport",
          title: r.iata,
          sub: `${r.name} · ${r.city}${r.region ? `, ${r.region}` : ""}`,
          value: r.region ? `${r.city}, ${r.region}` : r.city,
          lat: r.lat,
          lon: r.lon,
        });
      } else if (
        norm(r.name).startsWith(needle) ||
        norm(r.city).startsWith(needle)
      ) {
        consider("pref", {
          kind: "airport",
          title: r.iata,
          sub: `${r.name} · ${r.city}${r.region ? `, ${r.region}` : ""}`,
          value: r.region ? `${r.city}, ${r.region}` : r.city,
          lat: r.lat,
          lon: r.lon,
        });
      } else if (norm(`${r.iata} ${r.name} ${r.city}`).includes(needle)) {
        consider("sub", {
          kind: "airport",
          title: r.iata,
          sub: `${r.name} · ${r.city}${r.region ? `, ${r.region}` : ""}`,
          value: r.region ? `${r.city}, ${r.region}` : r.city,
          lat: r.lat,
          lon: r.lon,
        });
      }
    }
  }

  if (kinds.includes("city")) {
    for (const r of load<CityRow>("cities.json")) {
      if (full()) break;
      const n = norm(r.name);
      const a = norm(r.ascii);
      if (n === needle || a === needle) {
        consider("exact", {
          kind: "city",
          title: r.region ? `${r.name}, ${r.region}` : r.name,
          sub: r.country,
          value: r.region ? `${r.name}, ${r.region}` : r.name,
          lat: r.lat,
          lon: r.lon,
        });
      } else if (n.startsWith(needle) || a.startsWith(needle)) {
        consider("pref", {
          kind: "city",
          title: r.region ? `${r.name}, ${r.region}` : r.name,
          sub: r.country,
          value: r.region ? `${r.name}, ${r.region}` : r.name,
          lat: r.lat,
          lon: r.lon,
        });
      } else if (norm(`${r.name} ${r.ascii} ${r.region}`).includes(needle)) {
        consider("sub", {
          kind: "city",
          title: r.region ? `${r.name}, ${r.region}` : r.name,
          sub: r.country,
          value: r.region ? `${r.name}, ${r.region}` : r.name,
          lat: r.lat,
          lon: r.lon,
        });
      }
    }
  }

  if (kinds.includes("university")) {
    for (const r of load<UniversityRow>("universities.json")) {
      if (full()) break;
      const h = norm(r.name);
      if (!h.includes(needle)) continue;
      consider(h.startsWith(needle) ? "pref" : "sub", {
        kind: "university",
        title: r.name,
        sub: r.country,
        value: universityValue(r),
        lat: r.lat,
        lon: r.lon,
      });
    }
  }

  return [...exact, ...pref, ...sub].slice(0, limit);
}
