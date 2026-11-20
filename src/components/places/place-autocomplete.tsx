"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useViewerLocation } from "@/components/location/location-context";
import { haversineMiles } from "@/lib/geo";
import type { PlaceOption } from "@/lib/place-option";

export type { PlaceOption } from "@/lib/place-option";

/**
 * Text input with a place autocomplete dropdown (backed by /api/places
 * for cities/universities/airports and /api/address for street
 * addresses). Fully controlled: parent owns `value`. Picking an option
 * fills its `fill` text when present (addresses need the complete
 * address), otherwise its human-readable title.
 */
export function PlaceAutocomplete({
  name,
  id,
  value,
  onValueChange,
  onPick,
  placeholder,
  ariaLabel,
  kind = "city",
  source = "places",
  nearViewer = false,
  inputClassName = "",
  variant = "default",
  clearable = false,
  required = false,
  minLength,
  invalid = false,
  describedBy,
  dropAlign = "row",
  submitOnPick = false,
  onSubmit,
  surface = "glass",
  dropdownPortal,
  disabled = false,
}: {
  name?: string;
  id?: string;
  value: string;
  onValueChange: (next: string) => void;
  onPick?: (place: PlaceOption) => void;
  placeholder?: string;
  ariaLabel?: string;
  kind?: string;
  /**
   * "places" searches the vendored city/airport/university datasets;
   * "address" searches US street addresses through /api/address.
   */
  source?: "places" | "address";
  /**
   * Rank address results nearest-first against the viewer's device
   * location. The sort happens entirely in the browser, so coordinates
   * never reach the server. Use for pickup/origin fields, not
   * destinations.
   */
  nearViewer?: boolean;
  inputClassName?: string;
  variant?: "default" | "panel";
  clearable?: boolean;
  dropAlign?: "self" | "row";
  required?: boolean;
  minLength?: number;
  invalid?: boolean;
  describedBy?: string;
  /** Runs the parent's submit when an option is picked. Off by default
   *  so the picker and quick-post don't submit on every tap. */
  submitOnPick?: boolean;
  onSubmit?: (picked: PlaceOption) => void;
  /** Locked field: no fetching, no dropdown, no typing. */
  disabled?: boolean;
  /**
   * Dropdown surface. "glass" is the translucent fill used over the map
   * (feed search). "soft" switches to a solid app-black fill with the
   * same border/shadow for lists opening over busy content (form fields,
   * buttons, text) where see-through rows hurt readability.
   */
  surface?: "glass" | "soft";
  /**
   * When supplied, the glass dropdown is rendered into this container
   * instead of inside the component's own box. This makes the dropdown a
   * sibling of the search field in the DOM so its backdrop-filter blurs
   * the map directly rather than the parent's blurred surface.
   */
  dropdownPortal?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLSpanElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when an option is picked so the value-change effect doesn't
  // immediately re-search the full address and pop the list open again.
  const lastPicked = useRef<string | null>(null);
  // Monotonic id for the in-flight search. Aborting the fetch is not
  // enough: a response can already be resolving when a pick or a new
  // keystroke lands, and stale rows must never reopen the list.
  const requestSeq = useRef(0);
  const listboxId = `places-${useId()}`;
  const { coords } = useViewerLocation();
  // Address search needs a little more signal than a city prefix; it also
  // keeps metered Mapbox calls down.
  const minQuery = source === "address" ? 3 : 2;

  // Render-time adjustment: a query too short to search can't have results,
  // so drop any stale list immediately instead of waiting for the effect's
  // microtask. Sanctioned pattern, no cascading render.
  const [lastQuery, setLastQuery] = useState(value);
  if (value !== lastQuery) {
    setLastQuery(value);
    if (value.trim().length < minQuery && options.length > 0) {
      setOptions([]);
      setOpen(false);
    }
  }

  useEffect(() => {
    if (disabled) return;
    const q = value.trim();
    if (q.length < minQuery) return;
    if (lastPicked.current === value) return;
    const controller = new AbortController();
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      const url =
        source === "address"
          ? `/api/address?q=${encodeURIComponent(q)}`
          : `/api/places?q=${encodeURIComponent(q)}&kind=${kind}&v=2`;
      fetch(url, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (seq !== requestSeq.current) return;
          const results = (data?.results ?? []) as PlaceOption[];
          // Pickup searches feel local without leaking location: sort
          // the provider's results against the in-browser coordinates.
          const ranked =
            source === "address" && nearViewer && coords
              ? [...results].sort((a, b) => {
                  const distance = (o: PlaceOption) =>
                    o.lat == null || o.lng == null
                      ? Number.POSITIVE_INFINITY
                      : haversineMiles(coords, { lat: o.lat, lng: o.lng });
                  return distance(a) - distance(b);
                })
              : results;
          setOptions(ranked);
          setHighlight(-1);
          // Only pop the list open if the user is still in this field.
          // A slow response must not cover the next field after a quick
          // tab/click away.
          setOpen(
            ranked.length > 0 && document.activeElement === inputRef.current,
          );
        })
        .catch(() => {
          // Aborted superseded request — stay quiet.
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, kind, source, minQuery, nearViewer, coords, disabled]);

  // Close when tapping outside the box or the portaled dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !boxRef.current?.contains(t) &&
        !dropRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Dropdown position and width. In the portaled glass case the dropdown
  // is a sibling of the search field, so we position it absolutely within
  // the portal container to sit directly under the active field with the
  // same width. Otherwise it stays inside the autocomplete box and matches
  // the nearest fieldset/row.
  useEffect(() => {
    if (!open || variant !== "default") return;
    const dd = dropRef.current;
    const box = boxRef.current;
    if (!dd || !box) return;

    const portaled = Boolean(dropdownPortal && surface === "glass");
    if (portaled) {
      const field = box.closest(".search-field");
      if (!field || !dropdownPortal) return;
      const place = () => {
        const f = field.getBoundingClientRect();
        const p = dropdownPortal.getBoundingClientRect();
        dd.style.position = "absolute";
        dd.style.top = `${f.bottom - p.top + 4}px`;
        dd.style.left = `${f.left - p.left}px`;
        dd.style.width = `${f.width}px`;
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }

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
    // The bar marks itself with data-dropdown-below so the list hangs
    // off the BAR: full bar width, 2px below its bottom edge (the mt
    // class is the gap). Without the marker it anchors to the wrapper
    // (field width), which is the behavior every other surface uses.
    const below = box.closest("[data-dropdown-below]");
    const place = () => {
      const r = row.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const barRect = below ? below.getBoundingClientRect() : null;
      const a = barRect ?? r;
      dd.style.left = `${a.left - b.left}px`;
      dd.style.width = `${a.width}px`;
      if (barRect) {
        dd.style.top = `${barRect.bottom - b.top}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, variant, dropAlign, dropdownPortal, surface]);

  const pick = (opt: PlaceOption) => {
    // Addresses need the complete address (house number + city + ZIP) so
    // the server geocoder can resolve them; place picks keep their
    // human-readable name ("Lewis University") rather than the machine
    // value ("Lockport, IL").
    const next = opt.fill ?? opt.title;
    lastPicked.current = next;
    requestSeq.current += 1;
    onValueChange(next);
    // Drop the old suggestion list and close immediately. Without this
    // the value-change effect would fetch the picked address and reopen
    // a one-row dropdown after every pick.
    setOptions([]);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    onPick?.(opt);
    // Submit AFTER the value lands: onValueChange is parent state, so a
    // same-tick submit would read the previous value. A microtask lets
    // React commit first. submitOnPick is opt-in — the feed search runs
    // the query, other surfaces must not.
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
            {opt.kind === "address" ? null : (
              <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] capitalize text-muted">
                {opt.kind}
              </span>
            )}
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
              {/* Sub-lines that distinguish: airport cities ("Dallas,
                  TX") and address localities ("Oak Brook, IL, USA").
                  City ("US") and university ("United States") subs carry
                  no signal, so those rows stay title-only. Without the
                  address sub, same-street results in different cities
                  render as identical rows. */}
              {opt.kind === "airport" || opt.kind === "address" ? (
                <span className="block wrap-anywhere text-xs text-muted">
                  {opt.sub}
                </span>
              ) : null}
            </span>
            {opt.kind === "address" ? null : (
              <span className="mt-0.5 shrink-0 self-start rounded-full border border-white/15 px-2 py-0.5 text-[10px] capitalize text-muted">
                {opt.kind}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <span ref={boxRef} className="relative block min-w-0 w-full">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        required={required}
        minLength={minLength}
        disabled={disabled}
        onChange={(e) => {
          lastPicked.current = null;
          requestSeq.current += 1;
          onValueChange(e.target.value);
        }}
        onFocus={() => {
          if (options.length > 0) setOpen(true);
        }}
        onBlur={(e) => {
          // Tab/click to another field should close this list. Clicks on
          // an option are mousedown-prevented, so they never reach here.
          const related = e.relatedTarget as Node | null;
          if (
            !boxRef.current?.contains(related) &&
            !dropRef.current?.contains(related)
          ) {
            setOpen(false);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
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
          aria-label="Clear"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            lastPicked.current = null;
            requestSeq.current += 1;
            onValueChange("");
            setOptions([]);
            setOpen(false);
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
        // The list is the shared .glass-dark surface: dark fill plus blur
        // plus a soft drop shadow, no edge stroke. Separation from the
        // map comes from those alone. In the portaled glass case it is a
        // sibling of the search field so its backdrop-filter hits the map
        // directly; top/left/width are set imperatively in the effect.
        <DropdownList
          ref={dropRef}
          variant={variant}
          surface={surface}
          portal={dropdownPortal}
        >
          {variant === "panel" ? (
            cleanRows
          ) : (
            <>
              {richRows}
              {source === "address" ? (
                <p className="sticky bottom-0 border-t border-white/10 bg-app px-3 py-1.5 text-[10px] text-muted">
                  Address suggestions by Mapbox
                </p>
              ) : null}
            </>
          )}
        </DropdownList>
      ) : null}
    </span>
  );
}

const DropdownList = ({
  ref,
  variant,
  surface,
  portal,
  children,
}: {
  ref?: React.Ref<HTMLSpanElement>;
  variant: "default" | "panel";
  surface: "glass" | "soft";
  portal?: HTMLElement | null;
  children: React.ReactNode;
}) => {
  const portaled = Boolean(portal && surface === "glass" && variant === "default");
  const className =
    variant === "panel"
      ? "block border-t border-hairline"
      : surface === "soft"
        ? "thin-scrollbar absolute top-full z-30 mt-[2px] block max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-white/25 bg-app shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]"
        : portaled
          ? "thin-scrollbar absolute z-30 block max-h-60 overflow-y-auto overscroll-contain rounded-xl glass-dark"
          : "thin-scrollbar absolute top-full z-30 mt-[2px] block max-h-60 overflow-y-auto overscroll-contain rounded-xl glass-dark";
  const node = (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
  return portaled && portal ? createPortal(node, portal) : node;
};
