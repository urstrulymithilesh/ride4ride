"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";

/** Fired with `true` while a search field owns focus (its dropdown may
 *  cover the map's count pill). Same contract the chips used; rides-map
 *  listens. */
export const CHIP_PANEL_EVENT = "r4r:chip-panel";

/**
 * Feed from→to search bar: two fields with a swap button between them.
 * Each field takes a city, university, or airport — picks commit the
 * full title ("Aurora, IL", "Chicago O'Hare (ORD)", "Lewis University")
 * as plain from/to text, and the page's resolvePlace routes airport
 * titles to the tagged-post match and university names to the
 * description match. No separate airport/university params are written:
 * interacting with the bar replaces any ?airport= / ?university= from
 * an old link instead of stacking an invisible filter under new text.
 */
export function SearchForm({
  type,
  fromDefault,
  toDefault,
}: {
  type: string;
  fromDefault: string;
  toDefault: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDefault);
  const [to, setTo] = useState(toDefault);
  // The pickup counts as chosen only via a dropdown pick (or a shared
  // link, which seeds fromDefault). Typed-but-uncommitted text does not
  // unlock drop off.
  const [pickedFrom, setPickedFrom] = useState<string | null>(
    fromDefault.trim() ? fromDefault : null,
  );
  const toLocked = !pickedFrom;

  const runSearch = (f: string, t: string) => {
    // The tab is the route: hail lives at /, cars at /rides.
    const path = type !== "get" ? "/rides" : "/";
    const qs = new URLSearchParams();
    if (f.trim()) qs.set("from", f.trim());
    if (t.trim()) qs.set("to", t.trim());
    const s = qs.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  const commit = (side: "from" | "to", value: string) => {
    if (side === "from") setFrom(value);
    else setTo(value);
    (document.activeElement as HTMLElement | null)?.blur?.();
    runSearch(side === "from" ? value : from, side === "to" ? value : to);
  };

  // Dropdown picks commit. Only a pickup pick unlocks drop off.
  const pick = (side: "from" | "to", opt: { title: string }) => {
    if (side === "from") setPickedFrom(opt.title);
    commit(side, opt.title);
  };

  const change = (side: "from" | "to", v: string) => {
    if (side === "from") {
      setFrom(v);
      // Clearing pickup cascades: drop off loses its origin context, so
      // it clears too instead of filtering on its own. Editing pickup
      // away from the picked value merely locks drop off (no navigation
      // mid-typing).
      if (!v.trim()) {
        setPickedFrom(null);
        if (to.trim()) setTo("");
        runSearch("", "");
        return;
      }
      if (v !== pickedFrom) {
        setPickedFrom(null);
        if (to.trim()) setTo("");
      }
    } else {
      setTo(v);
    }
    // Clearing a field (X or select-all-delete) re-runs the search
    // without it. Mid-typing values never navigate — only picks,
    // submits, swaps, and clears do.
    if (!v.trim()) {
      runSearch(side === "from" ? "" : from, side === "to" ? "" : to);
    }
  };

  const swap = () => {
    if (!from.trim() && !to.trim()) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFrom(to);
    setTo(from);
    // A swap deliberately places both values, so the incoming pickup
    // counts as chosen and drop off stays usable.
    setPickedFrom(to.trim() ? to : null);
    runSearch(to, from);
  };

  const field = (
    side: "from" | "to",
    value: string,
    label: string,
  ) => {
    const locked = side === "to" && toLocked;
    return (
      // flex-1 shares the bar evenly; the autocomplete anchors its
      // dropdown to this wrapper (field width).
      <div className="min-w-0 flex-1">
        <PlaceAutocomplete
          value={value}
          onValueChange={(v) => change(side, v)}
          kind="all"
          placeholder="city, university or airport"
          ariaLabel={`${label} search`}
          submitOnPick
          onSubmit={(opt) => pick(side, opt)}
          clearable
          disabled={locked}
          inputClassName={`h-[20px] w-full bg-transparent text-[16px] leading-[20px] text-white outline-none placeholder:text-white/50 focus:outline-none disabled:cursor-not-allowed ${
            value ? "pl-[30px] pr-8" : "search-mag pl-[32px] pr-0 placeholder:text-[12.5px] placeholder:tracking-tighter"
          } ${locked ? "opacity-40" : ""}`}
        />
      </div>
    );
  };

  return (
    <form
      onSubmit={(e) => {
        // Enter with no highlighted suggestion commits the raw text.
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        runSearch(from, to);
      }}
      onFocus={() =>
        window.dispatchEvent(
          new CustomEvent(CHIP_PANEL_EVENT, { detail: true }),
        )
      }
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          window.dispatchEvent(
            new CustomEvent(CHIP_PANEL_EVENT, { detail: false }),
          );
        }
      }}
    >
      {/* Single bar to the exact spec: 570 wide, 60px gaps, 10/25
          padding, 10px radius, near-black glass. Height = dock × 0.75
          (dock measures 56, so 42 here — update together). Width caps
          at the 480 app column. The dropdown anchors to this row,
          full bar width. */}
      <div className="flex h-[40px] w-[570px] max-w-full flex-row items-center justify-center gap-[2px] rounded-[10px] bg-black px-[5px] py-[10px] opacity-90 backdrop-blur-[12.5px]">
        {field("from", from, "pickup")}
        <button
          type="button"
          onClick={swap}
          disabled={!from.trim() && !to.trim()}
          aria-label="swap pickup and drop off"
          className="flex h-9 w-5 shrink-0 items-center justify-center rounded-full text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 8h11l-3-3" />
            <path d="M17 16H6l3 3" />
          </svg>
        </button>
        {field("to", to, "drop off")}
      </div>
    </form>
  );
}
