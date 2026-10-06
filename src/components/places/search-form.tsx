"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (when !== "current") qs.set("when", when);
    if (type !== "all") qs.set("type", type);
    if (from.trim()) qs.set("from", from.trim());
    if (to.trim()) qs.set("to", to.trim());
    const s = qs.toString();
    router.push(s ? `/rides?${s}` : "/rides");
  };

  return (
    <form onSubmit={submit} className="mb-6 flex items-center gap-2">
      <PlaceAutocomplete
        value={from}
        onValueChange={setFrom}
        placeholder="city, zip or airport"
        ariaLabel="from"
        kind="city,airport"
        inputClassName="input min-w-0 w-full rounded-full px-4 text-center text-sm"
      />
      <span className="shrink-0 text-sm text-content">to</span>
      <PlaceAutocomplete
        value={to}
        onValueChange={setTo}
        placeholder="city, zip or airport"
        ariaLabel="to"
        kind="city,airport"
        inputClassName="input min-w-0 w-full rounded-full px-4 text-center text-sm"
      />
      <button
        type="submit"
        aria-label="search"
        className="btn btn-primary min-h-11 shrink-0 rounded-[10px] px-4 text-sm"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {showClear ? (
        <Link
          href={clearHref}
          aria-label="clear"
          className="btn btn-ghost shrink-0 px-3"
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
        </Link>
      ) : null}
    </form>
  );
}
