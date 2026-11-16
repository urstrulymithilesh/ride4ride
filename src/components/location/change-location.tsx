"use client";

import { LOCATION_CACHE_KEY } from "./location-context";

/**
 * Drop the saved viewer location and reload. The gate reappears, so the
 * user can retry device location or pick a different city. Menu item, not
 * a floating control — location changes are rare.
 */
export function ChangeLocationButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(LOCATION_CACHE_KEY);
        } catch {
          // Private mode: reload still re-asks.
        }
        window.location.reload();
      }}
      className={className}
    >
      change location
    </button>
  );
}
