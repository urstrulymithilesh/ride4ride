import { NextResponse, type NextRequest } from "next/server";
import type { GeoLocation } from "@/lib/location";
import { lookupMaxMind } from "@/lib/maxmind";

/**
 * GET /api/location — coarse city/region from the device's IP address.
 * No GPS, no permission prompt, nothing stored. The IP itself is never
 * returned to the client; only the resolved "City, ST" label.
 *
 * Resolution order:
 *   1. Vercel geo headers (production) — free, no extra hop.
 *   2. Vendored MaxMind GeoLite2-City database — no network hop.
 *   3. ip-api.com lookup of the client IP from x-forwarded-for.
 * Localhost / private IPs resolve to null (no city to show).
 */

export const dynamic = "force-dynamic";

function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  return (
    v === "" ||
    v === "unknown" ||
    v === "localhost" ||
    v === "::1" ||
    v === "::ffff:127.0.0.1" ||
    v.startsWith("127.") ||
    v.startsWith("10.") ||
    v.startsWith("192.168.") ||
    v.startsWith("172.16.") ||
    v.startsWith("172.17.") ||
    v.startsWith("172.18.") ||
    v.startsWith("172.19.") ||
    v.startsWith("172.2") ||
    v.startsWith("172.30.") ||
    v.startsWith("172.31.") ||
    v.startsWith("::ffff:10.") ||
    v.startsWith("::ffff:192.168.")
  );
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

async function lookupIp(ip: string): Promise<GeoLocation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Free tier is HTTP-only; fields limited to keep the response tiny.
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionCode`,
      { signal: controller.signal, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      regionCode?: string;
    };
    if (data.status !== "success" || !data.city) return null;
    return { city: data.city, region: data.regionCode ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  // 1. Vercel edge headers when deployed there.
  const vercelCity = request.headers.get("x-vercel-ip-city");
  const vercelRegion = request.headers.get("x-vercel-ip-country-region");
  if (vercelCity) {
    try {
      const city = decodeURIComponent(vercelCity);
      if (city) {
        return NextResponse.json(
          { city, region: vercelRegion ?? "" } satisfies GeoLocation,
          { headers: { "cache-control": "private, max-age=86400" } },
        );
      }
    } catch {
      // fall through to IP lookup
    }
  }

  // 2. Vendored MaxMind database (non-Vercel hosts, no network hop).
  // 3. ip-api.com lookup for anything the file can't resolve.
  const ip = clientIp(request);
  if (!ip || isPrivateIp(ip)) {
    return NextResponse.json(
      { city: null, region: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const mm = lookupMaxMind(ip);
  if (mm) {
    return NextResponse.json(mm, {
      headers: { "cache-control": "private, max-age=86400" },
    });
  }
  const loc = await lookupIp(ip);
  if (!loc) {
    return NextResponse.json(
      { city: null, region: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(loc, {
    headers: { "cache-control": "private, max-age=86400" },
  });
}
