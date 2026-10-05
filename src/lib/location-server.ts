import { headers } from "next/headers";
import type { GeoLocation } from "@/lib/location";

/**
 * Best-effort city/region from request headers, no external fetch.
 * Vercel (production) provides `x-vercel-ip-city` (URL-encoded) and
 * `x-vercel-ip-country-region` (e.g. "IL") on every request. Locally
 * these are absent, so the client <TopBar> enhances via /api/location.
 *
 * Server-only: importing this module from a client component fails
 * the build by design (it depends on `next/headers`).
 */
export async function getLocationFromHeaders(): Promise<GeoLocation | null> {
  const h = await headers();
  const rawCity = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  if (!rawCity) return null;
  try {
    const city = decodeURIComponent(rawCity);
    if (!city) return null;
    return { city, region: region ?? "" };
  } catch {
    return null;
  }
}
