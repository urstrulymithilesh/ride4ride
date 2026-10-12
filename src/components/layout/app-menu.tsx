import Link from "next/link";
import { getUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { MenuButton } from "./menu-button";

/**
 * Floating hamburger (top-left everywhere). Signed-in menu lists identity
 * first (@handle, member-since, active post count), then account / legal /
 * about / support, with log out last.
 */
export async function AppMenu() {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  const joined = profile?.created_at
    ? `member since ${new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : null;

  // Active post count for the identity header. Owner-readable under RLS;
  // a failed count hides the line rather than showing a wrong number.
  let activePosts: number | null = null;
  if (user) {
    try {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      if (!error && count !== null) activePosts = count;
    } catch {
      activePosts = null;
    }
  }

  const item =
    "flex min-h-12 w-full items-center px-5 text-lg text-content hover:bg-white/10";

  return (
    <MenuButton>
        {/* Full-height drawer, flush left, rounded on the right edge only.
            Black glass: translucent enough to feel layered over the
            feed, opaque enough that green headlines can't bleed
            through and wreck legibility. */}
          {/* No border/radius/background here: the drawer shell in MenuButton
            already supplies them. Duplicating them drew a double outline
            with a seam where the two corners met. Content only. */}
          <div className="flex h-full flex-col overflow-y-auto">
          {user && profile ? (
            <div className="px-5 py-4">
              <p className="wrap-anywhere truncate text-base font-semibold text-content">
                @{profile.username}
              </p>
              {joined ? (
                <p className="mt-0.5 text-xs text-muted">{joined}</p>
              ) : null}
              {activePosts !== null ? (
                <p className="mt-2 text-xs text-content">
                  {activePosts} active post{activePosts === 1 ? "" : "s"}
                </p>
              ) : null}
              <div aria-hidden="true" className="mt-3 h-px bg-hairline" />
            </div>
          ) : null}
          <nav aria-label="menu" className="flex flex-1 flex-col overflow-y-auto py-2">
            <Link href="/profile" className={item}>
              account
            </Link>
            <Link href="/privacy" className={item}>
              privacy & terms
            </Link>
            <Link href="/about" className={item}>
              about
            </Link>
            <Link href="/support" className={item}>
              support
            </Link>
            {user ? (
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center px-5 text-lg text-content hover:bg-white/10"
                >
                  log out
                </button>
              </form>
            ) : (
              <div className="px-5 py-2">
                <Link
                  href="/sign-in"
                  className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white text-base font-semibold text-black"
                >
                  log in
                </Link>
              </div>
            )}
          </nav>
        </div>
    </MenuButton>
  );
}
