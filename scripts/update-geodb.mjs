/**
 * Download + extract the MaxMind GeoLite2-City database into ./geo/.
 * The .mmdb is gitignored (large, weekly updates) — run this locally and
 * whenever the copy is older than ~2 weeks:
 *
 *   $env:MAXMIND_LICENSE_KEY="<key>"; npm run geo:update   # windows
 *   MAXMIND_LICENSE_KEY=<key> npm run geo:update            # mac/linux
 *
 * On Vercel, set MAXMIND_LICENSE_KEY in project env and prefix the build
 * command with `npm run geo:update && ` so deploys refresh the file.
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const KEY = process.env.MAXMIND_LICENSE_KEY;
if (!KEY) {
  console.error("missing MAXMIND_LICENSE_KEY env var.");
  process.exit(1);
}

const DEST_DIR = join(process.cwd(), "geo");
const TMP = join(tmpdir(), `geolite2-${Date.now()}`);
const TARBALL = join(TMP, "GeoLite2-City.tar.gz");

mkdirSync(TMP, { recursive: true });
mkdirSync(DEST_DIR, { recursive: true });

const url =
  "https://download.maxmind.com/app/geoip_download" +
  `?edition_id=GeoLite2-City&license_key=${encodeURIComponent(KEY)}&suffix=tar.gz`;

console.log("downloading GeoLite2-City…");
const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(TARBALL));

console.log("extracting…");
try {
  execFileSync("tar", ["-xzf", TARBALL, "-C", TMP]);
} catch {
  console.error("the `tar` CLI is required to extract the archive.");
  process.exit(1);
}

const mmdb = readdirSync(TMP, { recursive: true })
  .map(String)
  .find((f) => f.endsWith("GeoLite2-City.mmdb"));
if (!mmdb) {
  console.error("GeoLite2-City.mmdb not found in archive.");
  process.exit(1);
}
// copy (not rename): TMP may live on another drive than the project.
copyFileSync(join(TMP, mmdb), join(DEST_DIR, "GeoLite2-City.mmdb"));
rmSync(TMP, { recursive: true, force: true });
console.log("saved to geo/GeoLite2-City.mmdb");
