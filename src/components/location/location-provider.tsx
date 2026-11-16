"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PlaceAutocomplete,
  type PlaceOption,
} from "@/components/places/place-autocomplete";
import {
  LOCATION_CACHE_KEY,
  LocationContext,
  type LocationStatus,
  type ViewerCoords,
} from "./location-context";

/**
 * Device location gate.
 *
 * ride4ride is location-first now: the map centers on the viewer and the
 * feed is sorted by distance. Device location is preferred; if the browser
 * blocks it, a manual city pick is available. Coordinates live only in
 * this provider and a persistent local cache — they are never sent to the
 * server, never put in a cookie, and never logged.
 */

type Status = LocationStatus;

// Persisted so a returning visitor is not asked again on every tab or
// reload. A granted browser permission still refreshes it silently; if
// permission is blocked, the saved location keeps the app usable.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedCoords extends ViewerCoords {
  at: number;
}

interface CachedViewer {
  coords: ViewerCoords;
  at: number;
}

function readCache(): CachedViewer | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCoords;
    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lng !== "number" ||
      typeof parsed?.at !== "number" ||
      Date.now() - parsed.at > CACHE_TTL_MS
    ) {
      localStorage.removeItem(LOCATION_CACHE_KEY);
      return null;
    }
    return {
      coords: {
        lat: parsed.lat,
        lng: parsed.lng,
        accuracy: parsed.accuracy ?? null,
      },
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

function writeCache(coords: ViewerCoords) {
  try {
    localStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ ...coords, at: Date.now() }),
    );
  } catch {
    // Private mode etc. — in-memory state still drives this visit.
  }
}

function CrosshairIcon() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="text-white"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<ViewerCoords | null>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const pathname = usePathname();

  const requestPosition = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    // A silent refresh keeps the already-granted app visible; the button
    // path shows the "finding you" state instead.
    if (!silent) setStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: ViewerCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        };
        setCoords(next);
        writeCache(next);
        setStatus("granted");
      },
      (err) => {
        // A background refresh must not knock a cached user out of the app.
        if (silent) return;
        // 1 = PERMISSION_DENIED. Everything else is a device/position
        // failure, which is retryable and must not be framed as a denial.
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      {
        // City-level precision is plenty; high accuracy burns battery
        // and can time out indoors.
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  }, []);

  // A manually chosen city center. Persisted like a device fix, so the
  // next visit skips the permission gate entirely.
  const setManualLocation = useCallback((next: ViewerCoords) => {
    setCoords(next);
    writeCache(next);
    setStatus("granted");
    setManualOpen(false);
  }, []);

  useEffect(() => {
    let live = true;
    const unsupported =
      typeof navigator === "undefined" || !navigator.geolocation;
    if (unsupported) {
      // Microtask, not a sync setState in the effect body — the lint rule
      // (and React's guidance) treats the latter as a cascading render.
      Promise.resolve().then(() => {
        if (live) setStatus("unsupported");
      });
      return () => {
        live = false;
      };
    }

    Promise.resolve().then(() => {
      if (!live) return;
      // The IP-scoped city picker is gone. Clear its old client-side
      // leftovers so a stale city can't linger in storage or a cookie.
      try {
        localStorage.removeItem("r4r-city");
        localStorage.removeItem("r4r-location");
        document.cookie = "r4r-city=; Max-Age=0; path=/";
      } catch {
        // Storage can be unavailable in private mode; nothing to clear.
      }

      const cached = readCache();
      if (cached) {
        setCoords(cached.coords);
        setStatus("granted");
      }

      // Permissions API lets a returning visitor skip the prompt entirely.
      // Browsers without it fall back to the explicit button.
      const permissions = navigator.permissions;
      if (!permissions?.query) {
        if (!cached) setStatus("prompt");
        return;
      }

      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (!live) return;
          if (result.state === "granted") {
            // A fresh cache is good enough for this visit; don't tear the
            // map down just to move the dot a few meters. Older caches
            // refresh silently in the background.
            if (!cached) requestPosition(false);
            else if (Date.now() - cached.at > 60_000) requestPosition(true);
          } else if (result.state === "denied") {
            if (!cached) setStatus("denied");
          } else if (!cached) {
            setStatus("prompt");
          }
        })
        .catch(() => {
          if (live && !cached) setStatus("prompt");
        });
    });

    return () => {
      live = false;
    };
  }, [requestPosition]);

  const value = {
    coords,
    status,
    request: requestPosition,
    setManualLocation,
  };

  // Legal pages must stay readable before permission is granted —
  // otherwise a visitor can't review the policy that explains the
  // location request. Everything else is gated.
  const gateOptional = pathname === "/privacy" || pathname === "/terms";
  const gated = !(status === "granted" && coords);
  const showGate = gated && !gateOptional;

  // "granted" without coords is a transient state (cache cleared between
  // renders); treat it as still checking rather than indexing past the map.
  const gateStatus: Exclude<Status, "granted"> =
    status === "granted" ? "checking" : status;

  const copy: Record<
    Exclude<Status, "granted">,
    { title: string; body: string; action: string | null }
  > = {
    checking: {
      title: "finding you",
      body: "asking your browser for a city-level location.",
      action: null,
    },
    prompt: {
      title: "find rides near you",
      body: "ride4ride needs your location to center the map and sort rides by distance. allow it, or choose a city manually.",
      action: "allow location",
    },
    denied: {
      title: "location is blocked",
      body: "allow location for this site in your browser settings, then try again. or choose a city manually.",
      action: "try again",
    },
    error: {
      title: "couldn't get your location",
      body: "turn on location services, check your connection, then try again. or choose a city manually.",
      action: "try again",
    },
    unsupported: {
      title: "location isn't available",
      body: "this browser can't share a location. choose a city manually to continue.",
      action: null,
    },
  };

  const message = copy[gateStatus];

  return (
    <LocationContext.Provider value={value}>
      {/* Keep the wrapper mounted whether or not the gate is up: swapping
          the tree would remount the whole app the moment permission is
          granted. Inert only while the modal is actually showing. */}
      <div className="contents" inert={showGate ? true : undefined}>
        {children}
      </div>
      {showGate ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-gate-title"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-app px-8 py-10 text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25">
            <CrosshairIcon />
          </span>
          {manualOpen ? (
            <>
              <h1
                id="location-gate-title"
                className="mt-5 text-xl font-semibold text-white"
              >
                set your location
              </h1>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                search for your city or nearest airport. we&apos;ll use its
                approximate center and remember it on this device.
              </p>
              <div className="mt-5 w-full max-w-xs">
                <PlaceAutocomplete
                  value={manualQuery}
                  onValueChange={setManualQuery}
                  kind="all"
                  placeholder="city, university or airport"
                  ariaLabel="city or airport"
                  surface="soft"
                  inputClassName="input placeholder:text-muted"
                  onPick={(place: PlaceOption) => {
                    if (
                      typeof place.lat === "number" &&
                      typeof place.lng === "number"
                    ) {
                      setManualLocation({
                        lat: place.lat,
                        lng: place.lng,
                        accuracy: null,
                      });
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="mt-4 text-xs font-medium text-muted underline decoration-1 underline-offset-4 hover:text-content"
              >
                back
              </button>
            </>
          ) : (
            <>
              <h1
                id="location-gate-title"
                className="mt-5 text-xl font-semibold text-white"
              >
                {message.title}
              </h1>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                {message.body}
              </p>
              {message.action ? (
                <button
                  type="button"
                  onClick={() => requestPosition()}
                  className="btn btn-primary mt-6 min-h-11 px-6 text-sm"
                >
                  {message.action}
                </button>
              ) : gateStatus === "checking" ? (
                <p className="mt-6 text-xs text-faint" aria-live="polite">
                  checking location…
                </p>
              ) : null}
              {gateStatus !== "checking" ? (
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="mt-4 text-xs font-medium text-muted underline decoration-1 underline-offset-4 hover:text-content"
                >
                  choose a city instead
                </button>
              ) : null}
            </>
          )}
          <p className="mt-6 max-w-xs text-[11px] leading-relaxed text-faint">
            your location stays on this device and is remembered for 30 days so
            you aren&apos;t asked every time. we use it only to center the map
            and sort rides by distance.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-faint">
            <Link
              href="/privacy"
              className="underline decoration-1 underline-offset-4 hover:text-muted"
            >
              privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/terms"
              className="underline decoration-1 underline-offset-4 hover:text-muted"
            >
              terms
            </Link>
          </div>
        </div>
      ) : null}
    </LocationContext.Provider>
  );
}
