"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GeoLocation } from "@/lib/location";
import { formatLocation } from "@/lib/location";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";

const COOKIE = "r4r-city";
const STORAGE_KEY = "r4r-city";
const GEO_CACHE_KEY = "r4r-location";
// 15 minutes, not a day: IP-geolocated city has to follow someone who
// travels or flips a VPN. A long cache left the old city pinned on screen.
const GEO_CACHE_TTL_MS = 15 * 60 * 1000;

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function readGeoCache(): GeoLocation | null {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { loc: GeoLocation; at: number };
    if (!parsed?.loc?.city || Date.now() - parsed.at > GEO_CACHE_TTL_MS)
      return null;
    return parsed.loc;
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  const encoded = `${COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000`;
  const cleared = `${COOKIE}=; path=/; max-age=0`;
  document.cookie = value ? encoded : cleared;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode etc. — cookie alone still scopes this visit.
  }
}

function CrosshairIcon() {
  // Approved size — do not change without asking.
  return (
    <svg
      width="13"
      height="13"
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
 * Detected city display that doubles as a picker. IP detection is the
 * default; any typed override replaces it everywhere (cookie + storage)
 * and re-scopes the feed. Reset returns to the detected city.
 */
export function LocationPicker({
  detected,
}: {
  detected: GeoLocation | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Override lives in localStorage, which doesn't exist during SSR — so
  // the first render is always empty (matching the server). On a full
  // reload the saved override is cleared instead of loaded: every refresh
  // falls back to fresh IP detection and scoping, by founder decision.
  // In-session saves (state + cookie, no reload) keep working until one.
  const [override, setOverride] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => readStored())
      .then((stored) => {
        if (!live || !stored) return;
        writeStored("");
        setOverride("");
        router.refresh();
      });
    return () => {
      live = false;
    };
  }, [router]);
  // Live detected city: server prop when edge headers exist, otherwise a
  // one-shot /api/location enhance. Stale-while-revalidate: the cache (if
  // any) paints instantly, but EVERY mount also fires a fresh lookup that
  // overwrites it when the answer changed — a traveler who moved cities
  // sees the new city on refresh instead of waiting out a TTL.
  // Promise chain, no sync setState in the effect body.
  const [liveDetected, setLiveDetected] = useState<GeoLocation | null>(
    detected,
  );
  useEffect(() => {
    if (detected) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const apply = (next: GeoLocation | null) => {
      if (!active || !next?.city) return;
      setLiveDetected((cur) =>
        cur?.city === next.city && cur?.region === next.region ? cur : next,
      );
      try {
        localStorage.setItem(
          GEO_CACHE_KEY,
          JSON.stringify({ loc: next, at: Date.now() }),
        );
      } catch {
        // Private mode etc. — location still shows for this visit.
      }
    };
    Promise.resolve()
      .then(() => readGeoCache())
      .then((cached) => {
        if (cached) apply(cached);
      })
      .catch(() => {
        // Corrupt cache etc. — the fresh lookup below still runs.
      })
      .finally(() => {
        if (!active) {
          clearTimeout(timer);
          return;
        }
        fetch("/api/location", {
          signal: controller.signal,
          cache: "no-store",
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            clearTimeout(timer);
            if (!active) return;
            apply(
              data?.city != null
                ? { city: data.city, region: data.region ?? "" }
                : null,
            );
          })
          .catch(() => {
            clearTimeout(timer);
          });
      });
    return () => {
      active = false;
    };
  }, [detected]);
  const [draft, setDraft] = useState("");

  const shown = override
    ? override
    : liveDetected
      ? formatLocation(liveDetected)
      : "";

  const save = () => {
    const value = draft.trim();
    if (!value) return;
    writeStored(value);
    setOverride(value);
    setDraft("");
    setOpen(false);
    router.refresh();
  };

  // The promised reset: drop the saved override everywhere it lives and
  // re-render. With no override and no cache entry, the next paint falls
  // back to fresh IP detection — so a refresh after moving cities shows
  // the current city instead of a saved or cached one.
  const reset = () => {
    writeStored("");
    setOverride("");
    setDraft("");
    setOpen(false);
    router.refresh();
  };

  return (
    <span className="relative flex w-full justify-center">
      <span className="flex min-h-11 items-center">
        {/* Icon + city stay pixel-centered; "change" hangs off the side
            in absolute position so it can't shift the center. Only
            "change" opens the picker. */}
        <span className="relative flex items-center gap-0.5">
          <CrosshairIcon />
          {shown ? (
            <span className="whitespace-nowrap text-xs font-semibold tracking-wide">
              {shown}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setDraft(override);
              setOpen((v) => !v);
            }}
            aria-label="change city"
            aria-expanded={open}
            className="absolute left-full ml-2 whitespace-nowrap text-[8px] text-muted underline decoration-1 underline-offset-4"
          >
            change
          </button>
        </span>
      </span>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 cursor-default"
          />
          <span className="absolute right-0 top-12 block w-64 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
            <span className="block px-4 pt-3 text-xs text-muted">
              detected
            </span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="block px-4 pb-3 pt-2"
            >
              <PlaceAutocomplete
                value={draft}
                onValueChange={setDraft}
                placeholder="city, university or airport"
                ariaLabel="city and state"
                kind="all"
                inputClassName="input w-full text-sm"
              />
              <span className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  className="btn btn-primary min-h-11 flex-1 text-sm"
                >
                  save
                </button>
                {override ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="btn btn-ghost min-h-11 text-sm"
                  >
                    reset
                  </button>
                ) : null}
              </span>
            </form>
          </span>
        </>
      ) : null}
    </span>
  );
}
