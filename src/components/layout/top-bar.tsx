"use client";

import { useEffect, useState } from "react";
import type { GeoLocation } from "@/lib/location";
import { formatLocation } from "@/lib/location";

const CACHE_KEY = "r4r-location";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readCache(): GeoLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { loc: GeoLocation; at: number };
    if (!parsed?.loc?.city || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.loc;
  } catch {
    return null;
  }
}

function CrosshairIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Slim sticky top bar: hamburger menu (left) + detected location (right).
 * Server supplies the location when edge geo headers exist; otherwise the
 * bar enhances once via /api/location (cached 24h, no GPS, nothing stored).
 */
export function TopBar({
  initial,
  menu,
}: {
  initial: GeoLocation | null;
  menu: React.ReactNode;
}) {
  const [loc, setLoc] = useState<GeoLocation | null>(initial);

  useEffect(() => {
    if (initial) return;
    let live = true;
    const cached = readCache();
    if (cached) {
      setLoc(cached);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch("/api/location", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        clearTimeout(timer);
        if (!live) return;
        const next =
          data?.city != null
            ? { city: data.city, region: data.region ?? "" }
            : null;
        if (!next?.city) return;
        setLoc(next);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ loc: next, at: Date.now() }),
          );
        } catch {
          // Private mode etc. — location still shows for this visit.
        }
      })
      .catch(() => {
        clearTimeout(timer);
      });
    return () => {
      live = false;
    };
  }, [initial]);

  return (
    <header className="safe-top sticky top-0 z-40 bg-app/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between pl-5 pr-2">
        <span className="relative">{menu}</span>
        <div
          className="flex min-h-11 items-center gap-2 pr-2"
          aria-live="polite"
          aria-label={
            loc ? `your location: ${formatLocation(loc)}` : "locating you"
          }
        >
          {loc ? (
            <>
              <CrosshairIcon />
              <span className="whitespace-nowrap text-xl font-medium tracking-wide">
                {formatLocation(loc)}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
