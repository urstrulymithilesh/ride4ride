import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Vanity feed routes: /needride -> landing (hail), /rideavailable ->
// offers. Rewrites (not redirects) so the URL stays as typed.
const VANITY_ROUTES: Record<string, string> = {
  "/needride": "/",
  "/rideavailable": "/rides",
};

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on the server
// before routes render; here it refreshes the Supabase auth session.
export async function proxy(request: NextRequest) {
  const vanity = VANITY_ROUTES[request.nextUrl.pathname];
  if (vanity) {
    const url = request.nextUrl.clone();
    url.pathname = vanity;
    return NextResponse.rewrite(url);
  }
  // Renamed route: /messages (and thread links) moved to /chat.
  if (
    request.nextUrl.pathname === "/messages" ||
    request.nextUrl.pathname.startsWith("/messages/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace(/^\/messages/, "/chat");
    return NextResponse.redirect(url);
  }
  // Renamed route: /account moved to /settings.
  if (request.nextUrl.pathname === "/account") {
    const url = request.nextUrl.clone();
    url.pathname = "/settings";
    return NextResponse.redirect(url);
  }
  // Legacy cleanup: the ride type is the route now (/ = hail,
  // /rides = offers), so a lingering ?type= is stripped, never honored.
  // Scoped to the two feed routes — other pages (e.g. auth confirm) use
  // their own `type` params.
  if (
    (request.nextUrl.pathname === "/" ||
      request.nextUrl.pathname === "/rides") &&
    request.nextUrl.searchParams.has("type")
  ) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("type");
    return NextResponse.redirect(url);
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
