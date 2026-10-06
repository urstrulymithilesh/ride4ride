/**
 * Download free place datasets and slim them into data/places/ for
 * offline scoping (city / airport / university pickers):
 *   - OurAirports airports.csv (public domain) -> airports.json
 *     (IATA commercial airports only)
 *   - GeoNames cities5000 (CC-BY, attribution in about page)
 *     -> cities.json
 *   - Wikidata universities with coordinates -> universities.json
 *     (best-effort: skipped with a warning if the query fails)
 *
 *   npm run places:update
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "places");
mkdirSync(DIR, { recursive: true });

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- airports (OurAirports, public domain) ---
console.log("downloading OurAirports…");
{
  const csv = await fetchText("https://ourairports.com/data/airports.csv");
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",").map((h) => h.replaceAll('"', ""));
  const idx = (name) => head.indexOf(name);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    // quoted fields may contain commas: split carefully
    const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) ?? [];
    const get = (n) => (cols[idx(n)] ?? "").replace(/^"|"$/g, "");
    const iata = get("iata_code");
    const type = get("type");
    if (!iata || !type.includes("airport")) continue;
    if (get("iso_country") !== "US") continue;
    if (get("scheduled_service") !== "yes") continue;
    const region = get("iso_region").split("-")[1] ?? "";
    out.push({
      iata,
      name: get("name"),
      city: get("municipality"),
      region,
      country: get("iso_country"),
      lat: Number(get("latitude_deg")),
      lon: Number(get("longitude_deg")),
    });
  }
  writeFileSync(join(DIR, "airports.json"), JSON.stringify(out));
  console.log(`airports: ${out.length} IATA airports`);
}

// --- cities (GeoNames cities1000, CC-BY: pop >= 1000, US only) ---
console.log("downloading GeoNames cities1000…");
{
  // Lazy unzip: cities5000.zip contains a single .txt; use the `tar`-style
  // approach via powershell Expand-Archive when available, else jszip-free
  // manual path below. Simplest portable: fetch the zipped file to disk and
  // expand with the platform tool.
  const { execFileSync } = await import("node:child_process");
  const { createWriteStream, readdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { pipeline } = await import("node:stream/promises");
  const tmp = join(tmpdir(), `places-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const zipPath = join(tmp, "cities1000.zip");
  const res = await fetch("https://download.geonames.org/export/dump/cities1000.zip");
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} geonames`);
  await pipeline(res.body, createWriteStream(zipPath));
  try {
    if (process.platform === "win32") {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${tmp}" -Force`,
      ]);
    } else {
      execFileSync("unzip", ["-o", zipPath, "-d", tmp]);
    }
  } catch {
    throw new Error("could not expand cities1000.zip (need Expand-Archive/unzip)");
  }
  const txt = readdirSync(tmp).map(String).find((f) => f.endsWith(".txt"));
  if (!txt) throw new Error("cities1000.txt missing from archive");
  const { readFileSync } = await import("node:fs");
  const out = [];
  for (const line of readFileSync(join(tmp, txt), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const c = line.split("\t");
    if (c[8] !== "US") continue;
    // name, asciiname, lat, lon, country, admin1, population
    out.push({
      name: c[1],
      ascii: c[2],
      lat: Number(c[4]),
      lon: Number(c[5]),
      country: c[8],
      region: c[10],
      pop: Number(c[14] ?? 0),
    });
  }
  out.sort((a, b) => b.pop - a.pop);
  writeFileSync(join(DIR, "cities.json"), JSON.stringify(out));
  console.log(`cities: ${out.length} US (pop >= 1000)`);
  rmSync(tmp, { recursive: true, force: true });
}

// --- universities (Wikidata, best-effort) ---
console.log("querying Wikidata universities…");
try {
  const sparql = `SELECT ?item ?itemLabel ?countryLabel ?coord WHERE {
    ?item wdt:P31/wdt:P279* wd:Q3918;
          wdt:P625 ?coord.
    OPTIONAL { ?item wdt:P17 ?country. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const data = await fetchJson(
    "https://query.wikidata.org/sparql?query=" +
      encodeURIComponent(sparql) +
      "&format=json",
    { "User-Agent": "ride4ride-places/1.0 (contact: ride4ride.com)" },
  );
  const out = [];
  for (const b of data.results?.bindings ?? []) {
    const coord = b.coord?.value ?? ""; // "Point(lon lat)"
    const m = /Point\((-?[\d.]+) (-?[\d.]+)\)/.exec(coord);
    if (!b.itemLabel?.value || !m) continue;
    if (/disambiguation|category/i.test(b.itemLabel.value)) continue;
    if ((b.countryLabel?.value ?? "") !== "United States") continue;
    out.push({
      name: b.itemLabel.value,
      country: b.countryLabel?.value ?? "",
      lat: Number(m[2]),
      lon: Number(m[1]),
    });
  }
  writeFileSync(join(DIR, "universities.json"), JSON.stringify(out));
  console.log(`universities: ${out.length}`);
} catch (e) {
  console.warn(`universities skipped: ${e.message}`);
}
console.log("done -> data/places/");
