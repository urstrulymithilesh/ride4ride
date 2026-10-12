"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClearIcon } from "@/components/places/search-icons";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";

/**
 * From → to search bar with autocomplete dropdowns. Client-side only
 * because picks fill the inputs and submit navigates; the query itself
 * stays in shareable `?from=&to=` params.
 */
export function SearchForm({
  when,
  type,
  fromDefault,
  toDefault,
  clearHref,
  showClear,
}: {
  when: string;
  type: string;
  fromDefault: string;
  toDefault: string;
  clearHref: string;
  showClear: boolean;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDefault);
  const [to, setTo] = useState(toDefault);

  // `next` carries the value just picked, so the very first search after
  // a pick is correct even though the parent's state hasn't committed
  // yet. Plain Enter (and submit) has no override and reads state.
  const runSearch = (next?: { from?: string; to?: string }) => {
    const f = (next?.from ?? from).trim();
    const t = (next?.to ?? to).trim();
    const qs = new URLSearchParams();
    if (when !== "current") qs.set("when", when);
    if (type !== "all") qs.set("type", type);
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    const s = qs.toString();
    router.push(s ? `/rides?${s}` : "/rides");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  // Slim field: no search icon, placeholder/value optically centered. The
  // clear X is absolutely positioned so it never steals width — a
  // flex sibling would push the centered text off-center as soon as a
  // value appeared. Enter submits.
  const field = (
    label: string,
    value: string,
    setValue: (v: string) => void,
  ) => (
    // Legend is pulled out of flow and centered ON the border, so it
    // stops adding a line of height above the input. The content row
    // then gets equal vertical padding and centers its contents, and
    // the X is centered on the box itself rather than anchored to a
    // bottom edge — that combination is what kept text and X drifting
    // apart at different heights.
    <fieldset className="relative rounded-[10px] border border-white/25">
      <legend className="absolute left-3 top-0 -translate-y-1/2 bg-app px-1 text-[11px] leading-none text-muted">
        {label}
      </legend>
      <div className="flex items-center px-3 py-2">
        <PlaceAutocomplete
          value={value}
          onValueChange={setValue}
          placeholder="search city, university or airport"
          ariaLabel={label}
          kind="all"
          dropAlign="self"
          submitOnPick
          onSubmit={(opt) =>
            // opt carries the freshly picked name, so the first search
            // is correct without waiting on state to commit.
            runSearch(label === "from" ? { from: opt.title } : { to: opt.title })
          }
          inputClassName="input min-h-[22px] w-full border-0 bg-transparent p-0 text-center text-[13px] placeholder:text-[13px]"
        />
      </div>
      {value.trim() ? (
        <button
          type="button"
          aria-label={`clear ${label}`}
          // Clearing is a filter change, so it re-runs the search
          // immediately instead of leaving a stale filtered board.
          onClick={() => {
            setValue("");
            runSearch(label === "from" ? { from: "" } : { to: "" });
          }}
          className="absolute right-2 top-1/2 flex h-[22px] w-6 -translate-y-1/2 items-center justify-center text-muted hover:text-content"
        >
          <ClearIcon />
        </button>
      ) : null}
    </fieldset>
  );

  return (
    <form onSubmit={submit} className="mb-6 flex flex-col gap-3">
      {field("from", from, setFrom)}
      {field("to", to, setTo)}
      {showClear ? (
        // Below the fields: beside them it stole width and broke the
        // full-bleed boxes the mock shows.
        <Link href={clearHref} className="self-start text-xs text-muted underline">
          clear search
        </Link>
      ) : null}
    </form>
  );
}
