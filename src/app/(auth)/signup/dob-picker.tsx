"use client";

import { useMemo, useState } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Latest pickable birthday: 18 years ago today. The server re-checks. */
function maxBirthday(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
}

function toISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m + 1)}-${p(d)}`;
}

/**
 * Date of birth picker in the site's own chrome: black glass popover,
 * hairline borders, white-on-black selected day. No native calendar.
 * The picked YYYY-MM-DD rides in the hidden input the server validates.
 */
export function DobPicker({ error }: { error?: string }) {
  const max = useMemo(() => maxBirthday(), []);
  const minYear = max.getFullYear() - 82;
  const [open, setOpen] = useState(false);
  const [pickYear, setPickYear] = useState(false);
  const [iso, setIso] = useState("");
  const [viewY, setViewY] = useState(max.getFullYear());
  const [viewM, setViewM] = useState(max.getMonth());

  const label = useMemo(() => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [iso]);

  function toggle() {
    // Reopening jumps back to the picked month so the selection is visible.
    if (!open && iso) {
      const [y, m] = iso.split("-").map(Number);
      setViewY(y);
      setViewM(m - 1);
    }
    setPickYear(false);
    setOpen((o) => !o);
  }

  function shift(delta: number) {
    let y = viewY;
    let m = viewM + delta;
    if (m < 0) {
      y -= 1;
      m = 11;
    } else if (m > 11) {
      y += 1;
      m = 0;
    }
    if (y < minYear || y > max.getFullYear()) return;
    if (y === max.getFullYear() && m > max.getMonth()) return;
    setViewY(y);
    setViewM(m);
  }

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const leadBlanks = new Date(viewY, viewM, 1).getDay();
  const pastMax = viewY === max.getFullYear() && viewM === max.getMonth();

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <label
        htmlFor="field-dob-button"
        className="sr-only text-sm font-medium text-content"
      >
        Date of birth
      </label>
      <button
        id="field-dob-button"
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="input wrap-anywhere flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={iso ? "text-content" : "text-faint"}>
          {iso ? label : "Date of birth"}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0 text-muted"
        >
          <rect x="3" y="4.5" width="18" height="16" rx="3" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      </button>

      {open ? (
        <>
          {/* Transparent layer: any tap outside closes, no layout effect. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="dialog"
            aria-label="Choose date of birth"
            className="absolute inset-x-0 top-full z-50 mt-2 rounded-xl border border-white/20 bg-app/95 p-3 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shift(-1)}
                disabled={pickYear || (viewY === minYear && viewM === 0)}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted hover:bg-white/10 hover:text-content disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setPickYear((p) => !p)}
                aria-label="Choose year"
                className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-white/10"
              >
                <span>{MONTHS[viewM]}</span>
                <span>{viewY}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className={`text-muted transition-transform ${pickYear ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => shift(1)}
                disabled={pickYear || pastMax}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted hover:bg-white/10 hover:text-content disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                ›
              </button>
            </div>

            {pickYear ? (
              <div
                role="listbox"
                aria-label="Choose year"
                className="thin-scrollbar mt-2 grid max-h-56 grid-cols-3 gap-0.5 overflow-y-auto"
              >
                {Array.from(
                  { length: max.getFullYear() - minYear + 1 },
                  (_, i) => max.getFullYear() - i,
                ).map((y) => (
                  <button
                    key={y}
                    type="button"
                    role="option"
                    aria-selected={y === viewY}
                    onClick={() => {
                      let m = viewM;
                      if (y === max.getFullYear() && m > max.getMonth()) {
                        m = max.getMonth();
                      }
                      setViewY(y);
                      setViewM(m);
                      setPickYear(false);
                    }}
                    className={`flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors ${
                      y === viewY
                        ? "bg-white font-semibold text-black"
                        : "text-content hover:bg-white/10"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  className="flex h-7 items-center justify-center text-[11px] font-medium text-faint"
                >
                  {w}
                </span>
              ))}
              {Array.from({ length: leadBlanks }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const cell = new Date(viewY, viewM, day);
                const disabled = cell > max;
                const selected = iso === toISO(viewY, viewM, day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setIso(toISO(viewY, viewM, day));
                      setOpen(false);
                    }}
                    aria-label={`${day} ${MONTHS[viewM]} ${viewY}`}
                    className={`flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors ${
                      selected
                        ? "bg-white font-semibold text-black"
                        : disabled
                          ? "text-faint/30"
                          : "text-content hover:bg-white/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
              </div>
            )}
          </div>
        </>
      ) : null}

      <input type="hidden" name="dob" value={iso} />
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
