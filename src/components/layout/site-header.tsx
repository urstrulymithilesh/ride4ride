import Link from "next/link";
import { getProfile, getUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

/**
 * Global header. Public (renders for everyone) but session-aware: shows the
 * signed-in user's display name + sign out, or sign in / sign up links.
 */
export async function SiteHeader() {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

  const navLink =
    "inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface hover:text-content";

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-hairline bg-app/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center text-base font-semibold tracking-tight text-content"
        >
          Ride4Ride
        </Link>

        <nav
          aria-label="Primary"
          className="ml-auto flex items-center gap-1 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
        >
          <Link href="/rides" className={navLink}>
            Browse
          </Link>

          {user ? (
            <>
              <Link href="/rides/new" className={navLink}>
                Post
              </Link>
              <Link href="/messages" className={navLink}>
                Messages
              </Link>
              {profile?.is_admin ? (
                <Link href="/admin" className={navLink}>
                  Admin
                </Link>
              ) : null}
              <form action={signOut}>
                <button type="submit" className={navLink}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className={navLink}>
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="btn btn-primary min-h-11 px-4 text-sm"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
