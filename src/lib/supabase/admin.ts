import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. Use ONLY in trusted
 * server-side contexts (cron route handlers), never in anything reachable
 * by the browser. The `server-only` import guards against client bundling.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Name the exact missing variable so misconfiguration is obvious.
  const missingName = !url
    ? "NEXT_PUBLIC_SUPABASE_URL"
    : !serviceKey
      ? "SUPABASE_SERVICE_ROLE_KEY"
      : null;
  if (missingName) {
    throw new Error(
      `[Ride4Ride] Missing required environment variable: ${missingName}\n` +
        `Set it in .env.local (see .env.local.example) for the service-role admin client.`,
    );
  }
  return createSupabaseClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
