"use client";

import { useEffect, useState } from "react";
import type { GeoLocation } from "@/lib/location";
import { LocationPicker } from "./location-picker";

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

/**
 * Slim sticky top bar: hamburger menu (left) + location picker (right).
 * Server supplies the detected location when edge geo headers exist;
 * otherwise the bar enhances once via /api/location (cached 24h, no GPS,
 * nothing stored). The picker lets anyone override with any city.
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    // The cache read rides the promise chain (instead of running
    // synchronously in the effect body) so no setState happens during
    // the effect itself. Same outcomes, one microtask later: cache hit
    // sets location, miss falls through to the fetch.
    Promise.resolve()
      .then(() => readCache())
      .then((cached) => {
        if (!live) return null;
        if (cached) {
          clearTimeout(timer);
          setLoc(cached);
          return null;
        }
        return fetch("/api/location", {
          signal: controller.signal,
          cache: "no-store",
        })
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
          });
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
        <LocationPicker detected={loc} />
      </div>
    </header>
  );
}
