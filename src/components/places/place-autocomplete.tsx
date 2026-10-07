"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlaceKind } from "@/lib/places";

export interface PlaceOption {
  kind: PlaceKind;
  title: string;
  sub: string;
  value: string;
}

/**
 * Text input with a place autocomplete dropdown (backed by /api/places).
 * Fully controlled: parent owns `value`. Picking an option fills the
 * machine-usable value (e.g. airports resolve to "Chicago, IL").
 */
export function PlaceAutocomplete({
  name,
  value,
  onValueChange,
  onPick,
  placeholder,
  ariaLabel,
  kind = "city",
  inputClassName = "",
}: {
  name?: string;
  value: string;
  onValueChange: (next: string) => void;
  onPick?: (place: PlaceOption) => void;
  placeholder?: string;
  ariaLabel?: string;
  kind?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLSpanElement>(null);
  const listboxId = `places-${useId()}`;

  // Render-time adjustment: a query too short to search can't have results,
  // so drop any stale list immediately instead of waiting for the effect's
  // microtask. Sanctioned pattern, no cascading render.
  const [lastQuery, setLastQuery] = useState(value);
  if (value !== lastQuery) {
    setLastQuery(value);
    if (value.trim().length < 2 && options.length > 0) {
      setOptions([]);
      setOpen(false);
    }
  }

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(q)}&kind=${kind}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const results = (data?.results ?? []) as PlaceOption[];
          setOptions(results);
          setHighlight(-1);
          setOpen(results.length > 0);
        })
        .catch(() => {
          // Aborted superseded request — stay quiet.
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, kind]);

  // Close when tapping outside the box.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open ]);

  const pick = (opt: PlaceOption) => {
    onValueChange(opt.value);
    setOpen(false);
    setHighlight(-1);
    onPick?.(opt);
  };

  return (
    <span ref={boxRef} className="relative min-w-0 flex-1">
      <input
        name={name}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
        }}
        onFocus={() => {
          if (options.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) {
            if (e.key === "Escape") setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + options.length) % options.length);
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            pick(options[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open && options.length > 0 ? listboxId : undefined}
        aria-activedescendant={
          open && highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
        }
        role="combobox"
        aria-autocomplete="list"
        autoComplete="off"
        className={inputClassName}
      />
      {open ? (
        <span className="absolute left-0 right-0 top-full z-30 mt-1 block max-h-60 overflow-y-auto rounded-xl border border-hairline bg-surface shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
          <ul role="listbox" id={listboxId} aria-label={ariaLabel}>
            {options.map((opt, i) => (
              <li key={`${opt.kind}:${opt.title}:${opt.sub}`}>
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-opt-${i}`}
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                    i === highlight ? "bg-surface-2" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content">
                      {opt.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {opt.sub}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                    {opt.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}
