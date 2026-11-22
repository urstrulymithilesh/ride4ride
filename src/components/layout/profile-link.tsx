import Link from "next/link";
import { PersonGlyph } from "@/components/places/search-icons";

/**
 * Dock profile slot: the person's glyph, linking to the /me resolver
 * (which bounces to your own profile page, or sign-in when signed out).
 * A plain link — no fetch, nothing to go stale. Lights up (big and
 * bright, like the active feed tabs) on profile pages.
 */
export function ProfileLink({ active = false }: { active?: boolean }) {
  return (
    <Link
      href="/me"
      aria-label="profile"
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full ${
        active ? "text-white" : "text-white/40 hover:text-content"
      }`}
    >
      <span
        className={`flex transition-transform duration-200 active:scale-95 ${
          active ? "scale-110" : "scale-90"
        }`}
      >
        <PersonGlyph height={18} />
      </span>
    </Link>
  );
}
