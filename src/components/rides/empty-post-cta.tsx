"use client";

import Link from "next/link";

/**
 * Empty-feed call to action. Goes to the full post page.
 */
export function EmptyPostCta() {
  return (
    <Link
      href="/newpost"
      className="mt-3 inline-block min-h-11 text-sm font-medium text-primary"
    >
      be the first to post one
    </Link>
  );
}
