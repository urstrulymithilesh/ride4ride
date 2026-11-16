import { NextResponse, type NextRequest } from "next/server";
import { searchAddresses } from "@/lib/address-search.server";

/**
 * GET /api/address?q=1014+bradford — street-address suggestions.
 *
 * The Mapbox token stays server-side. The browser only sees the same
 * {kind,title,sub,value,fill} shape as /api/places, so the dropdown can
 * render both sources with one component. Short queries return [] to
 * keep metered Mapbox calls down.
 */
export const dynamic = "force-dynamic";

const MAX_QUERY = 120;

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY);

  const results = q.length >= 3 ? await searchAddresses(q) : [];

  return NextResponse.json(
    { results },
    {
      // The result shape follows the code, and the browser cache absorbs
      // repeated keystrokes/backspacing for a short while.
      headers: { "cache-control": "private, max-age=60" },
    },
  );
}
