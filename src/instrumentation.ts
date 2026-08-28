/**
 * Runs once when the server process boots (Next.js instrumentation hook).
 * We validate the required public Supabase env vars here so a missing
 * variable fails FAST at startup with a message naming the exact variable,
 * instead of surfacing later as an opaque Supabase client error per request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSupabasePublicEnv } = await import("@/lib/supabase/env");
    getSupabasePublicEnv(); // throws with the exact missing variable name
  }
}
