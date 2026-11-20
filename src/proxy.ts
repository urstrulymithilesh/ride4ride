import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
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
