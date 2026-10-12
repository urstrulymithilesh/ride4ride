"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
  variant = "default",
  clearable = false,
  required = false,
  minLength,
  dropAlign = "row",
  submitOnPick = false,
  onSubmit,
  surface = "glass",
}: {
  name?: string;
  value: string;
  onValueChange: (next: string) => void;
  onPick?: (place: PlaceOption) => void;
  placeholder?: string;
  ariaLabel?: string;
  kind?: string;
  inputClassName?: string;
  /**
   * "panel" renders the results inline below the input inside the
   * parent's own bordered box (location picker): clean single-line
   * rows, no pills or sub-lines. "default" keeps the floating
   * dropdown with rich rows (feed search).
   */
  variant?: "default" | "panel";
  /**
   * Shows the in-box clear X while there is text (feed search only —
   * the picker has its own close/save/reset row).
   */
  clearable?: boolean;
  /**
   * "self" sizes the dropdown to its own field (stacked layouts);
   * "row" spans the whole form row from its left edge (side-by-side).
   */
  dropAlign?: "self" | "row";
  required?: boolean;
  minLength?: number;
  /** Runs the parent's submit when an option is picked. Off by default
   *  so the picker and quick-post don't submit on every tap. */
  submitOnPick?: boolean;
  onSubmit?: (picked: PlaceOption) => void;
  /**
   * Dropdown surface. "glass" is the default everywhere (translucent
   * fill + blur + specular edge). "soft" keeps the blur but raises the
   * fill for lists opening over busy content (buttons, text) where
   * see-through rows hurt readability.
   */
  surface?: "glass" | "soft";
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLSpanElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      fetch(`/api/places?q=${encodeURIComponent(q)}&kind=${kind}&v=2`, {
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
  }, [open]);

  // Dropdown width. "self" matches the visible bordered field — the
  // stacked from/to boxes each own their list. "row" spans the whole form
  // row and pins to the row's left edge, for side-by-side boxes.
  // Measured imperatively against the nearest fieldset/box: the input
  // itself is inset by the field's horizontal padding, so matching it
  // made the list visibly narrower than the box it belongs to.
  useEffect(() => {
    if (!open || variant !== "default") return;
    const dd = dropRef.current;
    const box = boxRef.current;
    if (!dd || !box) return;
    if (dropAlign === "self") {
      // The bordered ancestor is what the eye compares against; fall
      // back to the input when there is no fieldset (plain search bars).
      const target =
        box.closest("fieldset") ??
        box.parentElement ??
        inputRef.current ??
        box;
      const place = () => {
        const b = box.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        // Clamp to the box so the list never overhangs its right edge.
        const width = Math.min(t.width, box.clientWidth);
        dd.style.left = `${t.left - b.left + (t.width - width) / 2}px`;
        dd.style.width = `${width}px`;
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }
    const row = box.parentElement;
    if (!row) return;
    const place = () => {
      const r = row.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      dd.style.left = `${r.left - b.left}px`;
      dd.style.width = `${r.width}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, variant, dropAlign]);

  const pick = (opt: PlaceOption) => {
    // Fill the human-readable name ("Lewis University"), never the
    // machine value ("Lockport, IL"). Filtering resolves the name back
    // to a city server-side at search time.
    onValueChange(opt.title);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    onPick?.(opt);
    // Submit AFTER the value lands: onValueChange is parent state, so a
    // same-tick submit would read the previous value. A microtask lets
    // React commit first. submitOnPick is opt-in — the feed search runs
    // the query, the location picker and quick-post must not.
    if (submitOnPick) queueMicrotask(() => onSubmit?.(opt));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // A highlighted option wins: pick it, and pick() submits. With
      // nothing highlighted Enter must fall through to the form's own
      // submit — this handler returns early otherwise, which silently
      // killed the only remaining way to run a search.
      if (open && highlight >= 0) {
        e.preventDefault();
        pick(options[highlight]);
      }
      return;
    }
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
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Clean single-line rows for the roomy surfaces (panel + wide).
  // Index in the key as well: even if two options ever render identical
  // text again, reconciliation stays correct.
  const cleanRows = (
    <ul
      role="listbox"
      id={listboxId}
      aria-label={ariaLabel}
      className="thin-scrollbar max-h-72 overflow-y-auto overscroll-contain py-2"
    >
      {options.map((opt, i) => (
        <li key={`${opt.kind}:${opt.title}:${opt.sub}:${i}`}>
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
            className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] text-content ${
              i === highlight ? "bg-white/10" : ""
            }`}
          >
            <span className="block min-w-0 flex-1 wrap-anywhere">{opt.title}</span>
            <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-muted">
              {opt.kind}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  // Two-line rows for the floating dropdown: title plus its sub-line
  // (city/state for airports, country for universities). The picker
  // panel keeps the single-line cleanRows above.
  const richRows = (
    <ul role="listbox" id={listboxId} aria-label={ariaLabel}>
      {options.map((opt, i) => (
        <li key={`${opt.kind}:${opt.title}:${opt.sub}:${i}`}>
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
              i === highlight ? "bg-white/10" : ""
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block wrap-anywhere text-sm font-medium text-content">
                {opt.title}
              </span>
              <span className="block wrap-anywhere text-xs text-muted">
                {opt.sub}
              </span>
            </span>
            <span className="mt-0.5 shrink-0 self-start rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-muted">
              {opt.kind}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <span ref={boxRef} className="relative block min-w-0 w-full">
      <input
        ref={inputRef}
        name={name}
        value={value}
        required={required}
        minLength={minLength}
        onChange={(e) => {
          onValueChange(e.target.value);
        }}
        onFocus={() => {
          if (options.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
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
        className={`${inputClassName}${clearable && value ? " pr-12" : ""}`}
      />
      {/* Clear-text X on the right, feed search only and only while
          there is something to clear. Mousedown is swallowed so focus
          stays. */}
      {clearable && value ? (
        <button
          type="button"
          aria-label="clear"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            onValueChange("");
            inputRef.current?.blur();
          }}
          className="absolute right-3 top-1/2 flex min-h-11 min-w-10 -translate-y-1/2 items-center justify-center text-muted hover:text-content"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
      ) : null}
      {open ? (
        // Glass over a black canvas has nothing to blur, so the readable
        // surface comes from a brighter hairline, a top inner highlight
        // (specular edge), and a translucent fill — not from the blur
        // alone. Drop + inset shadows combine in one shadow-[] value.
        <span
          ref={variant === "default" ? dropRef : undefined}
          className={
            variant === "panel"
              ? "block border-t border-hairline"
              : surface === "soft"
                ? "thin-scrollbar absolute top-full z-30 mt-1 block max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-white/25 bg-app/80 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
                : "thin-scrollbar absolute top-full z-30 mt-1 block max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-white/25 bg-app/60 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl backdrop-saturate-150"
          }
        >
          {variant === "panel" ? cleanRows : richRows}
        </span>
      ) : null}
    </span>
  );
}
