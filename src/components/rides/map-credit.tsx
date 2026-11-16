"use client";

import { usePathname } from "next/navigation";

const ATTRIBUTION_URL = "https://openfreemap.org/";
const OPENMAPTILES_URL = "https://openmaptiles.org/";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/**
 * Map credit for the ride feed, pinned vertically to the right-center
 * edge of the app column. Writing-mode keeps the three credits in one
 * column; only the pill itself is interactive, so the map underneath
 * stays draggable. Other pages render nothing.
 */
export function MapCredit() {
  const pathname = usePathname();

  if (pathname !== "/rides" && pathname !== "/") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2">
      <span className="pointer-events-auto absolute right-0 top-1/2 -translate-y-1/2 rotate-180 whitespace-nowrap rounded-full glass-dark p-0 text-[9px] leading-none text-muted [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] [writing-mode:vertical-rl]">
        <a
          href={ATTRIBUTION_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-content"
        >
          OpenFreeMap
        </a>
        <span className="text-faint"> · </span>
        <a
          href={OPENMAPTILES_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-content"
        >
          OpenMapTiles
        </a>
        <span className="text-faint"> · </span>
        <a
          href={OSM_COPYRIGHT_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-content"
        >
          © OpenStreetMap
        </a>
      </span>
    </div>
  );
}
