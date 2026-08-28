import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";

export const metadata: Metadata = { title: "Browse rides" };

// Named columns only — NEVER select *. The `rides` table has no address
// columns (those live in the row-protected `ride_locations` table), and
// listing them explicitly keeps that guarantee obvious and the query lean.
const CARD_COLUMNS =
  "id, type, from_city, from_state, to_city, to_state, ride_date, is_future, distance_meters";

type When = "current" | "future";
type Sort = "newest" | "oldest";

interface Params {
  when?: string;
  zip?: string;
  city?: string;
  state?: string;
  sort?: string;
}

export default async function BrowseRidesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const when: When = sp.when === "future" ? "future" : "current";
  const sort: Sort = sp.sort === "oldest" ? "oldest" : "newest";
  const zip = sp.zip?.trim() ?? "";
  const city = sp.city?.trim() ?? "";
  const state = sp.state?.trim() ?? "";
  const hasFilters = Boolean(zip || city || state);

  // Build an href preserving current params, dropping empties.
  const hrefWith = (next: Partial<Params>) => {
    const merged = { when, sort, zip, city, state, ...next };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "when" && v === "current") && !(k === "sort" && v === "newest")) {
        qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    return s ? `/rides?${s}` : "/rides";
  };

  const supabase = await createClient();
  let query = supabase
    .from("rides")
    .select(CARD_COLUMNS)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .eq("is_future", when === "future");

  if (zip) query = query.eq("from_zip", zip);
  if (city) query = query.ilike("from_city", city);
  if (state) query = query.ilike("from_state", state);

  const { data: rides } = await query
    .order("created_at", { ascending: sort === "oldest" })
    .limit(60)
    .returns<RideCardData[]>();

  const tab = (value: When, label: string) => (
    <Link
      href={hrefWith({ when: value })}
      aria-current={when === value ? "page" : undefined}
      className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold ${
        when === value
          ? "bg-primary text-white"
          : "bg-surface text-muted hover:text-content"
      }`}
    >
      {label}
    </Link>
  );

  const sortLink = (value: Sort, label: string) => (
    <Link
      href={hrefWith({ sort: value })}
      aria-current={sort === value ? "true" : undefined}
      className={`inline-flex min-h-11 items-center px-2 ${
        sort === value ? "font-semibold text-primary" : "text-muted hover:text-content"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <main className="w-full flex-1 px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-content">Browse rides</h1>
        <p className="mt-1 text-sm text-muted">
          Open to everyone. Sign in to open details or connect.
        </p>
        <Link href="/rides/new" className="btn btn-primary mt-3 w-full">
          Post a ride
        </Link>
      </div>

      {/* Current / Future tabs */}
      <div className="mb-4 flex gap-2">
        {tab("current", "Current rides")}
        {tab("future", "Future rides")}
      </div>

      {/* Filters (GET form → shareable URL) */}
      <form
        method="get"
        action="/rides"
        className="card mb-4 flex flex-col gap-3"
      >
        <input type="hidden" name="when" value={when} />
        <input type="hidden" name="sort" value={sort} />
        <div className="flex gap-2">
          <FilterInput label="From city" name="city" defaultValue={city} placeholder="Riverside" />
          <FilterInput label="State" name="state" defaultValue={state} placeholder="CA" className="w-20 shrink-0" />
          <FilterInput label="ZIP" name="zip" defaultValue={zip} placeholder="92521" className="w-24 shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            Apply
          </button>
          {hasFilters ? (
            <Link
              href={hrefWith({ zip: "", city: "", state: "" })}
              className="btn btn-ghost"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {/* Sort + count */}
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>
          {rides?.length ?? 0} {when} ride{(rides?.length ?? 0) === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">Sort:</span>
          {sortLink("newest", "Newest")}
          <span className="text-hairline">|</span>
          {sortLink("oldest", "Oldest")}
        </div>
      </div>

      {!rides || rides.length === 0 ? (
        <div className="card border border-dashed border-hairline bg-transparent p-8 text-center">
          <p className="text-sm text-muted">
            {hasFilters
              ? "No rides match these filters."
              : `No ${when} rides posted yet.`}
          </p>
          {hasFilters ? (
            <Link
              href={hrefWith({ zip: "", city: "", state: "" })}
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              Clear filters
            </Link>
          ) : (
            <Link
              href="/rides/new"
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              Be the first to post one
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rides.map((r) => (
            <li key={r.id}>
              <RideCard ride={r} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterInput({
  label,
  name,
  defaultValue,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted ${className}`}>
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}
