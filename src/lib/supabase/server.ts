import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth session via Next's cookie store.
 *
 * Must be called per-request (do not cache the returned client), and only
 * from server-side code — it uses the anon key but is bound to the caller's
 * cookies. For privileged operations use a separate service-role client.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component. This can be
            // ignored if middleware is refreshing sessions (see
            // src/lib/supabase/middleware.ts).
          }
        },
      },
    },
  );
}
