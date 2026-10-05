import Link from "next/link";
import { getUser, getProfile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { MenuButton } from "./menu-button";

/**
 * Floating hamburger (top-left everywhere). Menu lists identity first,
 * then account / legal / about, with log out last in red.
 */
export async function AppMenu() {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  const joined = profile?.created_at
    ? `Joined ${new Date(profile.created_at).toLocaleDateString("en-US", { month: "short" })}, ${new Date(profile.created_at).getFullYear()}`
    : null;

  const item =
    "flex min-h-11 w-full items-center px-4 text-sm text-content hover:bg-surface-2";

  return (
    <MenuButton>
        <div className="w-64 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
          {user && profile ? (
            <div className="border-b border-hairline px-4 py-3">
              <p className="wrap-anywhere flex items-center gap-1.5 text-sm font-semibold text-content">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
                </svg>
                <span className="truncate">{profile.username}</span>
              </p>
              {joined ? (
                <p className="mt-0.5 text-xs text-muted">{joined}</p>
              ) : null}
            </div>
          ) : null}
          <nav aria-label="menu" className="flex flex-col py-1">
            {user ? (
              <Link href="/profile" className={item}>
                account
              </Link>
            ) : (
              <Link href="/sign-in" className={item}>
                sign in
              </Link>
            )}
            <Link href="/privacy" className={item}>
              privacy
            </Link>
            <Link href="/terms" className={item}>
              terms
            </Link>
            <Link href="/about" className={item}>
              about
            </Link>
          </nav>
          {user ? (
            <form
              action={signOut}
              className="border-t border-hairline p-2"
            >
              <button type="submit" className="btn btn-danger w-full">
                log out
              </button>
            </form>
          ) : null}
        </div>
    </MenuButton>
  );
}
