import { NextResponse, type NextRequest } from "next/server";
import { reverseGeocode } from "@/lib/reverse-geocode";

export const dynamic = "force-dynamic";

/**
 * GET /api/reverse-geocode?lat=..&lng=.. — coarse "City, ST" for the
 * profile's live-location line. Rounds coordinates to ~1km so repeated
 * fixes share the browser cache; the Mapbox token stays server-side.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  }
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
  if (!token) {
    console.error("[reverse-geocode] MAPBOX_ACCESS_TOKEN is not set.");
    return NextResponse.json({ error: "mapbox not configured" }, { status: 500 });
  }
  const place = await reverseGeocode(lat, lng, token);
  if (!place) return NextResponse.json({ error: "unknown" }, { status: 404 });
  return NextResponse.json(place, {
    headers: { "cache-control": "private, max-age=300" },
  });
}
