import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Reader, type ReaderModel } from "@maxmind/geoip2-node";
import type { GeoLocation } from "@/lib/location";

let reader: ReaderModel | null = null;
let attempted = false;

function getReader(): ReaderModel | null {
  if (attempted) return reader;
  attempted = true;
  try {
    const file =
      process.env.GEOIP_MMDB_PATH ??
      join(process.cwd(), "geo", "GeoLite2-City.mmdb");
    if (!existsSync(file)) return null;
    reader = Reader.openBuffer(readFileSync(file));
  } catch {
    reader = null;
  }
  return reader;
}

/**
 * City/region from the vendored MaxMind GeoLite2-City database
 * (refreshed via `npm run geo:update`). Null when the file is absent
 * or the IP doesn't resolve (private/reserved ranges throw).
 * Server-only: reads from the filesystem.
 */
export function lookupMaxMind(ip: string): GeoLocation | null {
  const r = getReader();
  if (!r) return null;
  try {
    const res = r.city(ip);
    const city = res.city?.names?.en;
    if (!city) return null;
    return { city, region: res.subdivisions?.[0]?.isoCode ?? "" };
  } catch {
    return null;
  }
}
