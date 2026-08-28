/**
 * Centralized, fail-loud reader for the PUBLIC Supabase env vars.
 *
 * Why this exists: `createBrowserClient` / `createServerClient` throw an
 * opaque "Your project's URL and Key are required to create a Supabase
 * client" when a variable is missing. This wrapper checks each one and
 * throws a message that names the EXACT missing variable and how to fix it.
 *
 * IMPORTANT: the vars are read via their literal, static keys
 * (`process.env.NEXT_PUBLIC_SUPABASE_URL`) — not a computed key — so Next
 * inlines them into the browser bundle. A dynamic `process.env[name]`
 * lookup would NOT be inlined and would read as undefined in the browser.
 */

function missing(name: string): never {
  throw new Error(
    `[Ride4Ride] Missing required environment variable: ${name}\n` +
      `Copy .env.local.example to .env.local and set ${name}, ` +
      `then restart the dev server (NEXT_PUBLIC_* vars are inlined at build time).`,
  );
}

/** The public URL + anon key used by the browser, server, and middleware clients. */
export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) missing("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return { url, anonKey };
}
