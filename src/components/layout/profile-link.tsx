import Link from "next/link";
import { PersonGlyph } from "@/components/places/search-icons";

/**
 * Dock profile slot: the person's glyph, linking to the /me resolver
 * (which bounces to your own profile page, or sign-in when signed out).
 * A plain link — no fetch, nothing to go stale.
 */
export function ProfileLink() {
  return (
    <Link
      href="/me"
      aria-label="profile"
      className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full text-white/40 hover:text-content"
    >
      <span className="flex scale-90 transition-transform duration-200 active:scale-95">
        <PersonGlyph height={18} />
      </span>
    </Link>
  );
}
