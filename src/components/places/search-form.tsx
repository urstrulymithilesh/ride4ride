"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";
import {
  ChevronDownIcon,
  ClearIcon,
} from "@/components/places/search-icons";

/** Fired with `true` while any chip search panel is open. The map's
 *  count pill hides for the duration (they share the same corner). */
export const CHIP_PANEL_EVENT = "r4r:chip-panel";

type ChipId = "pickup" | "dropoff" | "airport" | "university";

const CHIPS: {
  id: ChipId;
  label: string;
  placeholder: string;
  kind: string;
}[] = [
  { id: "pickup", label: "pick up", placeholder: "city", kind: "all" },
  { id: "airport", label: "airport", placeholder: "airport", kind: "airport" },
  {
    id: "university",
    label: "university",
    placeholder: "university",
    kind: "university",
  },
  { id: "dropoff", label: "drop off", placeholder: "city", kind: "all" },
];

/** Panel width. The row is 366px on a 390px screen, so the panel clamps
 *  left to keep its right edge inside. */
const PANEL_WIDTH = 256;

/**
 * Feed filter chips: pick up · drop off · airport · university. Tapping a
 * chip opens a search panel anchored under it, left edge to the chip's
 * left edge. Pick up / drop off feed the `from` / `to` query (restoring
 * the old bars' filtering); airport / university set the chip label only
 * until their behavior lands.
 */
export function SearchForm({
  when,
  type,
  fromDefault,
  toDefault,
  airportDefault,
  airportLabel,
  universityDefault,
  fromKindDefault,
}: {
  when: string;
  type: string;
  fromDefault: string;
  toDefault: string;
  airportDefault: string;
  airportLabel: string;
  universityDefault: string;
  fromKindDefault: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<ChipId | null>(null);
  const [text, setText] = useState<Record<ChipId, string>>({
    pickup: "",
    dropoff: "",
    airport: "",
    university: "",
  });
  // Selections double as the chip labels (truncated, never wrapped).
  // Pick up / drop off seed from the URL so shared links show them.
  const [picked, setPicked] = useState<Record<ChipId, string>>({
    pickup: fromDefault,
    dropoff: toDefault,
    airport: airportLabel,
    university: universityDefault,
  });
  // Airport navigates by IATA code (?airport=ORD) while the chip shows
  // the full title.
  const [airportCode, setAirportCode] = useState(airportDefault);
  // University navigates by school name (?university=Lewis University).
  const [uniName, setUniName] = useState(universityDefault);

  // Anchor math for the floating panel: chip position within the row.
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // Guards the scroll-to-dismiss: tapping a half-visible chip scrolls it
  // into view, and that programmatic scroll must not instantly close the
  // panel it just opened. Manual row flicks (later) still dismiss.
  const openedAt = useRef(0);
  const chipRefs = useRef<Partial<Record<ChipId, HTMLDivElement>>>({});
  const [panelLeft, setPanelLeft] = useState(0);
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH);
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !rowRef.current) return;
    const chip = chipRefs.current[open];
    if (!chip) return;
    // Pick up / airport: panel left edge sits on the chip's left edge.
    // University / drop off sit on the right half: their right edges
    // align instead. Coordinates are visible ones (layout minus row
    // scroll). The edge stays exact and the panel yields width instead,
    // so it never runs off-screen.
    const wrapW = wrapRef.current.clientWidth;
    const visLeft = chip.offsetLeft - rowRef.current.scrollLeft;
    const visRight = visLeft + chip.offsetWidth;
    let left: number;
    let width: number;
    if (open === "university" || open === "dropoff") {
      const right = Math.min(visRight, wrapW);
      width = Math.min(PANEL_WIDTH, right);
      left = right - width;
    } else {
      left = Math.max(0, visLeft);
      width = Math.min(PANEL_WIDTH, wrapW - left);
    }
    setPanelLeft(left);
    setPanelWidth(width);
  }, [open ]);

  // One panel at a time: outside tap or row scroll dismisses it.
  // The map's count pill hides while a panel is open (same corner).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(CHIP_PANEL_EVENT, { detail: open !== null }),
    );
  }, [open ]);
  useEffect(() => {
    if (!open) return;
    // Focus lands in the panel's box so typing searches immediately.
    (
      wrapRef.current?.querySelector(
        '[role="dialog"] input',
      ) as HTMLInputElement | null
    )?.focus({ preventScroll: true });
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open ]);

  const runSearch = (
    from: string,
    to: string,
    airport = airportCode,
    university = uniName,
  ) => {
    const f = from.trim();
    const t = to.trim();
    const a = airport.trim().toUpperCase();
    const u = university.trim();
    // The tab is the route: hail lives at /, cars at /rides.
    const path = type !== "get" ? "/rides" : "/";
    const qs = new URLSearchParams();
    if (when !== "current") qs.set("when", when);
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    if (/^[A-Z]{3}$/.test(a)) qs.set("airport", a);
    if (u) qs.set("university", u);
    const s = qs.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  const commit = (id: ChipId, value: string) => {
    const next = { ...picked, [id]: value };
    // Drop off needs an origin context (pick up, airport, or
    // university): losing the last one cascades.
    if (!next.pickup && !next.airport && !next.university) next.dropoff = "";
    setPicked(next);
    setOpen(null);
    // Pick up / drop off keep the old bars' filtering. Airport filters by
    // IATA code, university by school name (either end of the trip — see
    // the page query).
    if (id === "pickup") runSearch(value, next.dropoff);
    else if (id === "dropoff") runSearch(next.pickup, value);
    else if (id === "airport") {
      const code =
        value.match(/\(([A-Z]{3})\)\s*$/)?.[1] ??
        (value.trim() ? value.trim().toUpperCase() : "");
      setAirportCode(/^[A-Z]{3}$/.test(code) ? code : "");
      runSearch(next.pickup, next.dropoff, code);
    } else if (id === "university") {
      const name = value.split("·")[0]?.trim() ?? value.trim();
      setUniName(name);
      runSearch(next.pickup, next.dropoff, airportCode, name);
    }
  };

  const toggle = (id: ChipId) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    // Fully reveal the chip first: the panel anchors to its visible
    // position, and a half-off-screen chip would force a compromise.
    // Instant (not smooth) so the layout effect below reads the settled
    // scroll; the open-guard still absorbs the scroll event.
    chipRefs.current[id]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
    // Reopening seeds the box with the current selection.
    setText((t) => ({ ...t, [id]: picked[id] }));
    setOpen(id);
  };

  const active = CHIPS.find((c) => c.id === open);

  // Max two selections: with two chips set, the other two go inactive.
  // Selected chips stay enabled so they can be changed or cleared.
  const selectedIds = (Object.keys(picked) as ChipId[]).filter(
    (id) => picked[id].trim(),
  );
  const maxed = selectedIds.length >= 2;
  // Crowded (any selection): unselected chips go compact and the selected
  // label caps hard — the only combination that fits 366px at readable
  // sizes. Measured, not estimated: adjust if chips change.
  const crowded = selectedIds.length > 0;
  const isDisabled = (id: ChipId) => {
    if (picked[id].trim()) return false;
    if (maxed) return true;
    if (id === "dropoff")
      return !picked.pickup.trim() && !picked.airport && !picked.university;
    return false;
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={rowRef}
        onScroll={() => {
          if (Date.now() - openedAt.current > 400) setOpen(null);
        }}
        className="flex snap-x snap-proximity justify-between gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CHIPS.map((chip) => {
          // At max selections the inactive pair unmounts entirely, so the
          // two selected chips own the full row and nothing pushes off the
          // edge. Clearing one brings the pair back.
          if (maxed && !picked[chip.id].trim()) return null;
          const selected = Boolean(picked[chip.id].trim());
          const dim = isDisabled(chip.id);
          return (
            <div
              key={chip.id}
              ref={(el) => {
                if (el) chipRefs.current[chip.id] = el;
              }}
              className="relative shrink-0 snap-start"
            >
              <div
                className={`glass-dark flex h-7 items-center gap-1 rounded-[var(--bar-radius)] px-[18px] text-[11px] font-semibold text-white ${
                  dim ? "cursor-not-allowed opacity-40" : "opacity-[0.85]"
                }`}
              >
                <button
                  type="button"
                  aria-label={chip.label}
                  aria-haspopup="dialog"
                  aria-expanded={open === chip.id}
                  disabled={dim}
                  onClick={() => {
                    // Timestamp the open so the scroll-into-view of a
                    // half-visible chip doesn't instantly dismiss its panel.
                    openedAt.current = Date.now();
                    toggle(chip.id);
                  }}
                  className="flex min-w-0 items-center gap-1 disabled:cursor-not-allowed"
                >
                  <span
                    className={`truncate whitespace-nowrap ${
                      crowded && selected ? "max-w-[44px]" : "max-w-[96px]"
                    }`}
                  >
                    {picked[chip.id] || chip.label}
                  </span>
                  {selected ? null : (
                    <span className="flex shrink-0">
                      <ChevronDownIcon size={12} />
                    </span>
                  )}
                </button>
                {selected ? (
                  <button
                    type="button"
                    aria-label={`clear ${chip.label}`}
                    onClick={() => commit(chip.id, "")}
                    className="r4r-plus-pulse flex shrink-0 items-center justify-center rounded-full border border-white/50 p-[3px] text-white"
                  >
                    <ClearIcon size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {active ? (
        <div
          role="dialog"
          aria-label={`${active.label} search`}
          style={{ left: panelLeft, width: panelWidth }}
          className="glass-dark chip-panel absolute top-[calc(100%+4px)] z-30 rounded-[var(--bar-radius)] p-2 opacity-[0.97]"
        >
          <PlaceAutocomplete
            value={text[active.id]}
            onValueChange={(v) =>
              setText((t) => ({ ...t, [active.id]: v }))
            }
            placeholder={active.placeholder}
            ariaLabel={`${active.label} search`}
            kind={
              active.id === "dropoff" && fromKindDefault !== "city"
                ? "city"
                : active.kind
            }
            variant="panel"
            submitOnPick
            onSubmit={(opt) =>
              // Full place value ("Aurora, IL", not just "Aurora"): the
              // feed requires the pickup address to contain the city AND
              // the state, and likewise for drop off.
              commit(active.id, opt.title)
            }
            inputClassName="input h-8 max-h-8 min-h-0 w-full border-0 bg-transparent px-3 text-left text-[13px] text-white placeholder:text-white/50"
          />
          {picked[active.id] ? (
            <button
              type="button"
              onClick={() => commit(active.id, "")}
              className="mt-1 min-h-9 w-full rounded-lg text-center text-xs font-medium text-white/60 hover:text-content"
            >
              clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
