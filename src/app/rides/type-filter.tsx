"use client";

import { useRouter } from "next/navigation";

/**
 * Sort dropdown. Same pattern as the type filter: the value stays in the
 * shareable `?sort=` URL param (dropped when "Newest", the default).
 */
export function SortSelect({
  value,
  preserved,
}: {
  value: "newest" | "oldest";
  preserved: Record<string, string>;
}) {
  const router = useRouter();

  const onChange = (next: string) => {
    const qs = new URLSearchParams(preserved);
    if (next === "newest") {
      qs.delete("sort");
    } else {
      qs.set("sort", next);
    }
    const s = qs.toString();
    router.push(s ? `/rides?${s}` : "/rides");
  };

  return (
    <label className="inline-flex min-h-11 items-center gap-1.5 text-xs">
      sort:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="sort rides"
        className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm font-medium text-content"
      >
        <option value="newest">newest</option>
        <option value="oldest">oldest</option>
      </select>
    </label>
  );
}

export function TypeFilterSelect({
  value,
  preserved,
}: {
  value: "all" | "offer" | "get";
  preserved: Record<string, string>;
}) {
  const router = useRouter();

  const onChange = (next: string) => {
    const qs = new URLSearchParams(preserved);
    if (next === "get") {
      qs.delete("type");
    } else {
      qs.set("type", next);
    }
    const s = qs.toString();
    router.push(s ? `/rides?${s}` : "/rides");
  };

  return (
    <label className="inline-flex min-h-11 items-center gap-1.5 text-xs">
      show:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="filter by ride type"
        className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm font-medium text-content"
      >
        <option value="all">all rides</option>
        <option value="offer">available rides</option>
        <option value="get">rides needed</option>
      </select>
    </label>
  );
}
