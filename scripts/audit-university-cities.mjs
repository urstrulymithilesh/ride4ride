/**
 * Audit every university row's derived city against OpenStreetMap
 * boundaries, and auto-apply high-confidence corrections.
 *
 * Problem: universityValue() picks the nearest city POINT, which misfires
 * on border towns (Lewis University -> Lockport instead of Romeoville).
 * OSM reverse-geocoding returns the true containing municipality.
 *
 * Method per row:
 *   1. Derive the city locally (same haversine as src/lib/places.ts).
 *   2. Reverse-geocode via Nominatim (polite 1.2s spacing, cached).
 *   3. Take the first of city/municipality/town/village/hamlet + state.
 *   4. CORRECT only when the OSM municipality matches a row in our own
 *      cities.json with the same state (case-insensitive) AND differs
 *      from the derived city. Dataset-matched means the corrected label
 *      stays filterable; anything else is reported, never applied.
 *
 * Output: corrections applied in place to universities.json ({city,
 * region} overrides, same mechanism as the manual Lewis fix), full
 * report to university-city-audit.json, raw OSM cache in the OS temp
 * dir (resume-safe: re-running skips cached coordinates).
 *
 * Run: node scripts/audit-university-cities.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "places");
const DRY = process.argv.includes("--dry-run");
const CACHE_PATH = join(tmpdir(), "r4r-osm-cache.json");
const GAP_MS = 1200;

const STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine(a, b, c, d) {
  const R = 6371000;
  const t = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(t(c - a) / 2) ** 2 +
    Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestCity(lat, lon, cities) {
  let best = null;
  let bd = Infinity;
  for (const c of cities) {
    const d = haversine(lat, lon, c.lat, c.lon);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

const norm = (s) => (s ?? "").trim().toLowerCase();

async function reverseGeocode(lat, lon, cache) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (cache[key]) return cache[key];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=14`,
        { headers: { "User-Agent": "ride4ride-places/1.0 (contact: ride4ride.com)" } },
      );
      if (res.status === 403 || res.status === 429) {
        await sleep(10000);
        continue;
      }
      if (!res.ok) break;
      const data = await res.json();
      const addr = data.address ?? {};
      const out = {
        place:
          addr.city ?? addr.municipality ?? addr.town ?? addr.village ?? addr.hamlet ?? null,
        state: addr.state ?? null,
      };
      cache[key] = out;
      return out;
    } catch {
      await sleep(3000);
    }
  }
  cache[key] = { place: null, state: null, failed: true };
  return cache[key];
}

function saveCache(cache) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch { /* tmp unwritable — rerun just refetches */ }
}

const cities = JSON.parse(readFileSync(join(DIR, "cities.json"), "utf8"));
const byName = new Map();
for (const c of cities) {
  const k = `${norm(c.name)}|${c.region}`;
  if (!byName.has(k)) byName.set(k, c);
}

let cache = {};
try {
  if (existsSync(CACHE_PATH)) cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
} catch { cache = {}; }

const unis = JSON.parse(readFileSync(join(DIR, "universities.json"), "utf8"));
const report = { checked: 0, alreadyCorrect: 0, corrected: [], skipped: [], failed: [] };

for (let i = 0; i < unis.length; i++) {
  const u = unis[i];
  // Curated rows are ground truth — never re-audit them.
  if (u.city) {
    report.checked++;
    report.alreadyCorrect++;
    continue;
  }
  const near = nearestCity(u.lat, u.lon, cities);
  const derived = near ? (near.region ? `${near.name}, ${near.region}` : near.name) : u.name;
  const geo = await reverseGeocode(u.lat, u.lon, cache);
  report.checked++;
  if (geo.failed || !geo.place || !geo.state) {
    report.failed.push({ name: u.name, derived });
    continue;
  }
  const st = STATES[norm(geo.state)];
  if (!st) {
    report.skipped.push({ name: u.name, derived, reason: `unknown state ${geo.state}` });
    continue;
  }
  if (norm(geo.place) === norm(derived.split(",")[0]) && st === (near?.region ?? null)) {
    report.alreadyCorrect++;
    continue;
  }
  // High-confidence bar: the OSM municipality must exist in OUR dataset
  // with the same state, else the corrected label wouldn't be filterable.
  const match =
    byName.get(`${norm(geo.place)}|${st}`) ??
    byName.get(`${norm(geo.place).replace(/ (city|town|village)$/, "")}|${st}`);
  if (!match) {
    report.skipped.push({ name: u.name, derived, osm: `${geo.place}, ${st}`, reason: "no dataset city" });
    continue;
  }
  const label = `${match.name}, ${match.region}`;
  report.corrected.push({ name: u.name, was: derived, now: label });
  if (!DRY) {
    u.city = match.name;
    u.region = match.region;
  }
  if (i % 25 === 0) saveCache(cache);
  await sleep(GAP_MS);
}

saveCache(cache);
if (!DRY) writeFileSync(join(DIR, "universities.json"), JSON.stringify(unis));
writeFileSync(join(DIR, "university-city-audit.json"), JSON.stringify(report, null, 2));
console.log(
  `checked=${report.checked} ok=${report.alreadyCorrect} corrected=${report.corrected.length} skipped=${report.skipped.length} failed=${report.failed.length}${DRY ? " (dry run)" : ""}`,
);
