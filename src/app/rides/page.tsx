import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";
import { TypeFilterSelect, SortSelect } from "./type-filter";
import { WantedRouteForm } from "@/components/rides/wanted-route-form";
import { recordArrival } from "@/lib/arrivals";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "browse rides" };

// Named columns only — NEVER select *. The `rides` table has no address
// columns (those live in the row-protected `ride_locations` table), and
// listing them explicitly keeps that guarantee obvious and the query lean.
const CARD_COLUMNS =
  "id, type, from_city, from_state, to_city, to_state, ride_date, is_future, distance_meters, from_street, to_street, from_airport";

type When = "current" | "future";
type Sort = "newest" | "oldest";
type RideType = "all" | "offer" | "get";

interface Params {
  when?: string;
  zip?: string;
  city?: string;
  state?: string;
  airport?: string;
  sort?: string;
  type?: string;
}

export default async function BrowseRidesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const when: When = sp.when === "future" ? "future" : "current";
  const sort: Sort = sp.sort === "oldest" ? "oldest" : "newest";
  const rideType: RideType =
    sp.type === "offer" || sp.type === "all" ? sp.type : "get";
  const typeExplicit = sp.type === "offer" || sp.type === "all" || sp.type === "get";
  const zip = sp.zip?.trim() ?? "";
  const city = sp.city?.trim() ?? "";
  const state = sp.state?.trim() ?? "";
  // Airport filter aid (display twin on the card). Upper-cased: IATA only.
  const airport = sp.airport?.trim().toUpperCase() ?? "";
  const hasFilters = Boolean(zip || city || state || airport || typeExplicit);

  // IP-suggested FROM city (v3 pilot): Vercel supplies a geo city header,
  // offered as the filter box's starting text — always changeable, and it
  // never acts as a filter by itself (the query above uses only the
  // explicit `city` param). Never auto-fills a post (P-2). Absent locally
  // and behind some proxies, in which case there is simply no suggestion.
  let geoCity = "";
  try {
    const rawGeo = (await headers()).get("x-vercel-ip-city");
    if (rawGeo) geoCity = decodeURIComponent(rawGeo).trim();
  } catch {
    geoCity = "";
  }
  const cityInputDefault = city || geoCity;

  // Build an href preserving current params, dropping empties.
  const hrefWith = (next: Partial<Params>) => {
    const merged = { when, sort, type: rideType, zip, city, state, airport, ...next };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "when" && v === "current") && !(k === "sort" && v === "newest") && !(k === "type" && v === "get")) {
        qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    return s ? `/rides?${s}` : "/rides";
  };

  // Arrival tracking (T13). Fire before the feed query so a slow or
  // failing database does not cost us the one signal that tells a dead
  // link apart from a dead product.
  const viewer = await getUser();
  await recordArrival("feed", viewer?.id);

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
  if (airport) query = query.eq("from_airport", airport);
  if (rideType !== "all") query = query.eq("type", rideType);

  // Capture the error. Discarding it here is how a totally broken database
  // rendered as "0 current rides" with HTTP 200 and nothing in the logs:
  // `data` comes back null on failure, which is indistinguishable from an
  // empty result unless you look at `error`. On a board whose entire purpose
  // is answering "did anyone post", a silent failure produces exactly the
  // reading that says nobody did.
  const { data: rides, error: ridesError } = await query
    .order("created_at", { ascending: sort === "oldest" })
    .limit(60)
    .returns<RideCardData[]>();

  if (ridesError) {
    // Server-side log: this is the signal that was missing entirely before.
    console.error("[rides] feed query failed:", ridesError.message, ridesError);
  }

  // Only meaningful when ridesError is null. Kept separate so an empty list
  // can never be produced by a failure.
  const list = rides ?? [];

  const tab = (value: When, label: string, icon: React.ReactNode) => (
    <Link
      href={hrefWith({ when: value })}
      aria-current={when === value ? "page" : undefined}
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm ${
        when === value
          ? "bg-primary font-semibold text-white shadow-sm"
          : "font-medium text-muted hover:text-content"
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <main className="w-full flex-1 px-4">
      {/* Current / Future tabs — segmented control: grey track so the
          inactive tab reads as a tab, not stray text. */}
      <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
        {tab(
          "current",
          "current rides",
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
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>,
        )}
        {tab(
          "future",
          "future rides",
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
            <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
            <path d="M4 10h16" />
            <path d="M8.5 3.5v4" />
            <path d="M15.5 3.5v4" />
          </svg>,
        )}
      </div>

      {/* Filters (GET form → shareable URL) */}
      <form
        method="get"
        action="/rides"
        className="card mb-4 flex flex-col gap-3"
      >
        <input type="hidden" name="when" value={when} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="type" value={rideType} />
        <div className="flex gap-2">
          <FilterInput label="from city" name="city" defaultValue={cityInputDefault} placeholder="riverside" />
          <FilterInput label="state" name="state" defaultValue={state} placeholder="ca" className="w-20 shrink-0" />
          <FilterInput label="zip" name="zip" defaultValue={zip} placeholder="92521" className="w-24 shrink-0" />
          <FilterInput label="airport" name="airport" defaultValue={airport} placeholder="ord" className="w-20 shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            apply
          </button>
          {hasFilters ? (
            <Link
              href={hrefWith({ zip: "", city: "", state: "", airport: "", type: "get" })}
              className="btn btn-ghost"
            >
              clear
            </Link>
          ) : null}
        </div>
      </form>

      {/* Sort + type filter + count. On failure we show no count at all:
          "0 rides" would be a claim about the board we cannot actually make. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {ridesError
            ? "couldn't load rides"
            : `${list.length} ${when} ride${list.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <TypeFilterSelect
            value={rideType}
            preserved={Object.fromEntries(
              Object.entries({
                when: when === "future" ? when : "",
                sort: sort === "oldest" ? sort : "",
                zip,
                city,
                state,
                airport,
              }).filter(([, v]) => Boolean(v)),
            )}
          />
          <SortSelect
            value={sort}
            preserved={Object.fromEntries(
              Object.entries({
                when: when === "future" ? when : "",
                type: rideType === "get" ? "" : rideType,
                zip,
                city,
                state,
                airport,
              }).filter(([, v]) => Boolean(v)),
            )}
          />
        </div>
      </div>

      {ridesError ? (
        /* ERROR state — deliberately NOT the empty state. An empty board and
           a broken board mean opposite things and must never look alike. */
        <div
          role="alert"
          className="card border border-danger bg-transparent p-8 text-center"
        >
          <p className="text-sm font-semibold text-content">
            couldn&apos;t load rides.
          </p>
          <p className="mt-1 text-sm text-muted">
            something went wrong on our side, so we can&apos;t show the board
            right now. this is not the same as there being no rides.
          </p>
          <Link
            href={hrefWith({})}
            className="mt-3 inline-block text-sm font-medium text-primary"
          >
            try again
          </Link>
        </div>
      ) : list.length === 0 ? (
        <div className="card border border-dashed border-hairline bg-transparent p-8 text-center">
          <p className="text-sm text-muted">
            {hasFilters
              ? "no rides match these filters."
              : `no ${when} rides posted yet.`}
          </p>
          {hasFilters ? (
            <Link
              href={hrefWith({ zip: "", city: "", state: "", airport: "", type: "get" })}
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              clear filters
            </Link>
          ) : (
            <Link
              href="/rides/new"
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              be the first to post one
            </Link>
          )}
          <WantedRouteForm defaultOpen />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.id}>
              <RideCard ride={r} />
            </li>
          ))}
        </ul>
      )}

      {/* Standing entry point, always reachable. The rows we most need are
          for routes the board cannot serve, so this must not be gated
          behind a zero-result search. */}
      {!ridesError && list.length > 0 ? <WantedRouteForm /> : null}
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
