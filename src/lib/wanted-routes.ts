import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The claim mechanism for anonymously-created wanted_routes rows.
 *
 * WHY A COOKIE. A logged-out visitor submits a wanted route, then may sign
 * up. Signup sends a confirmation email, so they leave the site entirely
 * and return through a link that usually opens a different tab. Anything
 * held in React state or sessionStorage in the original tab is gone by
 * then. An httpOnly cookie survives that round trip.
 *
 * WHY THE SERVICE ROLE. Claiming means setting `created_by` on a row that
 * currently has none. Any RLS UPDATE policy permissive enough to allow
 * that from the client would let ANY authenticated user claim ANY
 * unclaimed row. So `wanted_routes` has no UPDATE policy at all, and the
 * claim runs server-side with the service role, gated on possession of
 * the cookie. `wanted_routes` holds no address or coordinate columns, so
 * this does not cross the address firewall.
 *
 * FAILING TO CLAIM IS NOT A FAILURE. If the cookie is missing — different
 * browser, cleared cookies, confirmation opened on a phone — the row stays
 * unowned. It still counts as unserved demand, which is the whole point of
 * the table. Claiming only exists so a user can later be told "we found
 * one", so every path here is best-effort and never blocks auth.
 */

const COOKIE_NAME = "r4r_wanted";
/** Claim window. Not the row's lifetime — rows are never auto-deleted. */
const CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60;
/** Bounded so a long-lived cookie cannot accumulate unbounded ids. */
const MAX_PENDING_IDS = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_PENDING_IDS);
}

/** Remember an anonymously-created row so it can be claimed after auth. */
export async function rememberWantedRoute(id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const jar = await cookies();
  const existing = parseIds(jar.get(COOKIE_NAME)?.value);
  const next = [...new Set([id, ...existing])].slice(0, MAX_PENDING_IDS);

  jar.set(COOKIE_NAME, next.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLAIM_WINDOW_SECONDS,
  });
}

/**
 * Attach any pending anonymous rows to this user, then clear the cookie.
 * Best-effort: never throws, never blocks the auth flow. Returns how many
 * rows were claimed.
 */
export async function claimWantedRoutes(userId: string): Promise<number> {
  try {
    const jar = await cookies();
    const ids = parseIds(jar.get(COOKIE_NAME)?.value);
    if (ids.length === 0) return 0;

    const admin = createAdminClient();
    // `is("created_by", null)` matters: it makes the claim idempotent and
    // means a stale cookie can never reassign a row someone already owns.
    const { data, error } = await admin
      .from("wanted_routes")
      .update({ created_by: userId })
      .in("id", ids)
      .is("created_by", null)
      .select("id");

    if (error) {
      console.error("[wanted-routes] claim failed:", error.message, error);
      return 0; // leave the cookie so the next sign-in retries
    }

    jar.delete(COOKIE_NAME);
    return data?.length ?? 0;
  } catch (err) {
    console.error("[wanted-routes] claim threw:", err);
    return 0;
  }
}
