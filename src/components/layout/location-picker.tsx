"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GeoLocation } from "@/lib/location";
import { formatLocation } from "@/lib/location";
import { PlaceAutocomplete, type PlaceOption } from "@/components/places/place-autocomplete";

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
  // Bumped by reset() to force a fresh IP detect (effect re-runs).
  const [geoNonce, setGeoNonce] = useState(0);
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
  }, [detected, geoNonce]);
  const [draft, setDraft] = useState("");
  // The last picked suggestion, if the text still matches it. A pick
  // carries the resolved "City, ST" value, so saving it scopes exactly.
  // Free text (typed, never picked, or edited after picking) resolves
  // through /api/places at save time instead — see save().
  const [picked, setPicked] = useState<PlaceOption | null>(null);

  const onDraftChange = (next: string) => {
    setDraft(next);
    setPicked(null);
  };

  const shown = override
    ? override
    : liveDetected
      ? formatLocation(liveDetected)
      : "";

  const persist = (value: string) => {
    writeStored(value);
    setOverride(value);
    setPicked(null);
    setDraft("");
    setOpen(false);
    router.refresh();
  };  const save = async () => {
    const typed = draft.trim();
    if (!typed) return;
    // Scope value, literally as picked: an airport pick scopes its IATA
    // code (titles read "Name (ORD)"; the code is extracted), a
    // university pick scopes its full "Name · City, ST" title (matching
    // extracts the bare name — descriptions mention "Lewis University",
    // never the suffixed title), a city scopes "City, ST".
    // Posts carry airport tags and description text; matching is
    // equality/text, never a nearest-city substitution. Free text
    // resolves server-side the same way.
    const airportCode = (title: string) =>
      title.match(/\(([A-Z]{3})\)\s*$/)?.[1] ?? title.trim();
    const scopeOf = (opt: { kind: string; title: string; value: string }) =>
      opt.kind === "city"
        ? opt.value
        : opt.kind === "airport"
          ? airportCode(opt.title)
          : opt.title;
    let value = picked && scopeOf(picked) === typed ? scopeOf(picked) : null;
    if (!value) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `/api/places?q=${encodeURIComponent(typed)}&kind=all&v=2`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{ kind: string; title: string; value: string }>;
          };
          const first = data?.results?.[0];
          if (first) {
            const literal =
              first.kind === "city"
                ? first.value.trim() || first.title.trim()
                : first.kind === "airport"
                  ? airportCode(first.title) || first.value.trim()
                  : first.title.trim();
            if (literal) value = literal;
          }
        }
      } catch {
        // Offline/aborted — fall through to the literal text.
      }
    }
    persist(value ?? typed);
  };

  // Reset = refresh = detect IP → city name → posts. Clears the saved
  // override AND the cached geo result, then forces a live /api/location
  // lookup so the readout and the feed re-scope to the current IP.
  const reset = () => {
    writeStored("");
    try {
      localStorage.removeItem(GEO_CACHE_KEY);
    } catch {
      // Private mode etc. — next paint still re-detects.
    }
    setOverride("");
    setPicked(null);
    setDraft("");
    setLiveDetected(null);
    setGeoNonce((n) => n + 1);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      {/* Feed-only backdrop: absolute against #main (now relative), so the
          dim + blur cover exactly the feed column between the bars — never
          painted behind TopBar/BottomNav, which keep their normal look. */}
      {open ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-md"
        />
      ) : null}
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
          /* Roomy centered panel (per mock): input and results share one
              bordered box, tapping a result saves immediately — no save
              button, no nested dropdown. */
          <span className="absolute left-1/2 top-12 z-10 block w-[min(92vw,26rem)] -translate-x-1/2 rounded-2xl border border-hairline bg-app/70 p-4 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            <span className="block px-1 pb-3 text-xs text-muted">
              detected
            </span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="block overflow-hidden rounded-2xl border border-hairline bg-app"
            >
              <PlaceAutocomplete
                value={draft}
                onValueChange={onDraftChange}
                onPick={(opt) => setPicked(opt)}
                placeholder="city, university or airport"
                ariaLabel="city and state"
                kind="all"
                variant="panel"
                inputClassName="input border-0 bg-transparent px-4 py-3 text-center text-sm placeholder:text-xs"
              />
            </form>
            <span className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost min-h-11 border border-white/25 text-sm"
              >
                close
              </button>
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
          </span>
      ) : null}
      </span>
    </>
  );
}
