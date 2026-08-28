import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";
import type { User } from "@supabase/supabase-js";

/**
 * Server-side auth helpers for Ride4Ride.
 *
 * Access model:
 *  - Public pages (home, browse) use `getUser()` and render regardless.
 *  - Protected pages use `requireUser()` to redirect to sign-in.
 *  - Protected *actions/details* on otherwise-public pages should render the
 *    <SignInPrompt> / <AuthGate> instead of redirecting (see components/auth).
 */

/**
 * Current authenticated user, or null. Always uses `getUser()` (not
 * `getSession()`), which re-validates the token with Supabase — safe to trust
 * on the server. Memoized per-request via React `cache`.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Require an authenticated user or redirect to sign-in, preserving where the
 * user was headed via `?redirectTo=`. Returns the user when present.
 */
export async function requireUser(redirectTo?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    const target = redirectTo
      ? `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
      : "/sign-in";
    redirect(target);
  }
  return user;
}

/** The current user's profile row, or null if signed out. Memoized per-request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
});
