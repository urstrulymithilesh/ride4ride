"use client";

import { usePathname } from "next/navigation";

const ATTRIBUTION_URL = "https://openfreemap.org/";
const OPENMAPTILES_URL = "https://openmaptiles.org/";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/**
 * Map credit for the ride feed: a half-size horizontal pill centered at
 * the bottom of the screen, just above the dock. Only the pill itself is
 * interactive, so the map underneath stays draggable. Other pages render
 * nothing.
 */
export function MapCredit() {
  const pathname = usePathname();

  if (pathname !== "/rides" && pathname !== "/") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-30 mx-auto w-full max-w-[480px] px-3">
      <div className="flex justify-center">
        <span className="pointer-events-auto whitespace-nowrap text-[8px] leading-none text-black [text-shadow:0_1px_2px_rgba(255,255,255,0.6)]">
        <a
          href={ATTRIBUTION_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-content"
        >
          OpenFreeMap
        </a>
        <span className="text-black"> · </span>
        <a
          href={OPENMAPTILES_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-content"
        >
          OpenMapTiles
        </a>
        <span className="text-black"> · </span>
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
    </div>
  );
}
