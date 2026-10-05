"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GeoLocation } from "@/lib/location";
import { formatLocation } from "@/lib/location";

const COOKIE = "r4r-city";
const STORAGE_KEY = "r4r-city";

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
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
 * default; any typed "city, st" overrides it everywhere (cookie + storage)
 * and re-scopes the feed. Reset returns to the detected city.
 */
export function LocationPicker({
  detected,
}: {
  detected: GeoLocation | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(readStored);
  const [draft, setDraft] = useState("");

  const shown = override
    ? override
    : detected
      ? formatLocation(detected)
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

  const reset = () => {
    writeStored("");
    setOverride("");
    setDraft("");
    setOpen(false);
    router.refresh();
  };

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(override);
          setOpen((v) => !v);
        }}
        aria-label={shown ? `location: ${shown}. change city` : "choose city"}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-1 pr-2"
      >
        <CrosshairIcon />
        {shown ? (
          <span className="whitespace-nowrap text-[10px] font-medium tracking-wide">
            {shown}
          </span>
        ) : null}
      </button>
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
              {override ? "selected city" : "detected city"}
            </span>
            <span className="block px-4 pb-3 pt-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder="city, st"
                aria-label="city and state"
                className="input text-sm"
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
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}
