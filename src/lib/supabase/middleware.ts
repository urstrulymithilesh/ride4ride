import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase auth session on every request and keeps the
 * auth cookies in sync between the browser and Server Components.
 *
 * Called from the root proxy (src/proxy.ts). Because browsing is public in
 * Ride4Ride, this does NOT redirect unauthenticated users — route-level
 * guards handle protected actions (posting, messaging, viewing details).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not run code between createServerClient and getUser().
  // getUser() refreshes the token; skipping it can log users out at random.
  await supabase.auth.getUser();

  return supabaseResponse;
}
