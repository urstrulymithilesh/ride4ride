"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PersonGlyph } from "@/components/places/search-icons";

/**
 * Dock profile slot: the person's glyph, linking to their own profile
 * page (ride4ride.com/<username>). The handle comes from /api/me because
 * server components can't reach into this client dock. Signed-out (or
 * still-loading) states point at sign-in, which bounces back here.
 */
export function ProfileLink() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live && typeof data?.username === "string") {
          setUsername(data.username);
        }
      })
      .catch(() => {
        // Stay on the sign-in fallback below.
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Link
      href={username ? `/${username}` : "/sign-in"}
      aria-label="profile"
      className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full text-white/40 hover:text-content"
    >
      <span className="flex scale-90 transition-transform duration-200 active:scale-110">
        <PersonGlyph height={18} />
      </span>
    </Link>
  );
}
