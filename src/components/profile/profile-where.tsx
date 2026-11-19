"use client";

import { useEffect, useState } from "react";
import {
  LOCATION_CACHE_KEY,
  useViewerLocation,
} from "@/components/location/location-context";

/** Round to ~1km so stationary fixes share one lookup. */
const cache = new Map<string, { city: string; state: string } | null>();
const keyOf = (lat: number, lng: number) =>
  `${lat.toFixed(2)},${lng.toFixed(2)}`;

function readCacheAt(): number | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown };
    return typeof parsed.at === "number" ? parsed.at : null;
  } catch {
    return null;
  }
}

function agoText(fixedAt: number, now: number): string | null {
  const minutes = Math.floor((now - fixedAt) / 60000);
  if (minutes < 0) return null;
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} Minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} Day${days === 1 ? "" : "s"} ago`;
  return null;
}

/**
 * Own-profile location line: the viewer's CURRENT GPS city plus how long
 * ago that fix landed ("Arlington, TX • 32 Minutes ago"). The city comes
 * from a server reverse-geocode (token stays server-side); the age ticks
 * from the fix timestamp, refreshing every 30s. Renders nothing until
 * the first lookup resolves.
 */
export function ProfileWhere() {
  const { coords } = useViewerLocation();
  const [city, setCity] = useState<string | null>(null);
  // Mount-time seed: the last persisted fix, so a fresh load still shows
  // an honest age instead of "Just now".
  const [fixedAt, setFixedAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readCacheAt(),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!coords) return;
    // Microtask, not sync setStates — the lint rule (and React's
    // guidance) treats the latter as a cascading render.
    let live = true;
    Promise.resolve().then(() => {
      if (!live) return;
      setFixedAt(Date.now());
      setNow(Date.now());
      const hit = cache.get(keyOf(coords.lat, coords.lng));
      if (hit !== undefined) {
        setCity(hit ? `${hit.city}, ${hit.state}` : null);
      }
    });
    const key = keyOf(coords.lat, coords.lng);
    if (cache.has(key)) return;
    fetch(`/api/reverse-geocode?lat=${coords.lat}&lng=${coords.lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live) return;
        if (data?.city && data?.state) {
          cache.set(key, { city: data.city, state: data.state });
          setCity(`${data.city}, ${data.state}`);
        } else {
          cache.set(key, null);
          setCity(null);
        }
      })
      .catch(() => {
        if (live) setCity(null);
      });
    return () => {
      live = false;
    };
  }, [coords]);

  // Keep the "N Minutes ago" honest while the page sits open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const ago = fixedAt === null ? null : agoText(fixedAt, now);
  const line =
    city && ago ? `${city} • ${ago}` : (city ?? ago);
  if (!line) return null;

  return (
    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.2 2.8Q21.5 2.3 21 3.6L12.9 20.6Q12.4 21.4 12 20.6V12.4Q12 11.9 11.5 11.9H3.4Q2.6 11.9 2.6 11.1V10.9Q2.6 10.4 3.2 10.2Z" />
      </svg>
      <span className="wrap-anywhere truncate">{line}</span>
    </p>
  );
}
