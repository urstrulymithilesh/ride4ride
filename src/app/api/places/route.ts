import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces, type PlaceKind } from "@/lib/places";

/**
 * GET /api/places?q=nap&kind=city — autocomplete over the vendored
 * OurAirports / GeoNames / Wikidata datasets. No keys, no tracking,
 * nothing stored. Short queries return [] to keep scans cheap.
 */
export const dynamic = "force-dynamic";

const KINDS = new Set(["all", "city", "airport", "university"]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const kinds = (request.nextUrl.searchParams.get("kind") ?? "all")
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is PlaceKind => KINDS.has(k) && k !== "all");
  return NextResponse.json(
    { results: searchPlaces(q, kinds.length > 0 ? kinds : "all") },
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
