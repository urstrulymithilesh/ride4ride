import Link from "next/link";
import { getUser } from "@/lib/auth";

function UserCircleIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="9.5" r="2.8" />
      <path d="M6.5 18.5c1.2-2.8 3.2-4.2 5.5-4.2s4.3 1.4 5.5 4.2" />
    </svg>
  );
}

/**
 * Global header. Logo on the left, profile icon on the right for signed-in
 * users (sign in / sign up for everyone else). All other navigation lives
 * in the bottom tab bar; sign out lives on the profile page.
 */
export async function SiteHeader() {
  const user = await getUser();

  const navLink =
    "inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-content";

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-hairline bg-app/95 backdrop-blur">
      <div className="flex h-14 items-center justify-end gap-2 px-4">
        <div className="flex items-center gap-1">
          {user ? (
            <Link
              href="/profile"
              aria-label="profile"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-content"
            >
              <UserCircleIcon />
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className={navLink}>
                sign in
              </Link>
              <Link
                href="/sign-up"
                className="btn btn-primary min-h-11 px-4 text-sm"
              >
                sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
