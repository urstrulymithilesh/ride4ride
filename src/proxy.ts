import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Vanity feed routes served by the /rides page with a locked type:
// /need-ride -> need-ride feed, /ride-available -> available feed.
// Rewrites (not redirects) so the URL stays as typed.
const TYPE_ROUTES: Record<string, string> = {
  "/need-ride": "get",
  "/ride-available": "offer",
};

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on the server
// before routes render; here it refreshes the Supabase auth session.
export async function proxy(request: NextRequest) {
  const forced = TYPE_ROUTES[request.nextUrl.pathname];
  if (forced) {
    const url = request.nextUrl.clone();
    url.pathname = "/rides";
    if (!url.searchParams.has("type")) url.searchParams.set("type", forced);
    return NextResponse.rewrite(url);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files:
     * - _next/static, _next/image
     * - favicon.ico
     * - common image extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
