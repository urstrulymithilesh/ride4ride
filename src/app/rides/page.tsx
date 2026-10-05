import Link from "next/link";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";
import { recordArrival } from "@/lib/arrivals";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "browse rides" };

// Named columns only — NEVER select *. The `rides` table has no address
// columns (those live in the row-protected `ride_locations` table), and
// listing them explicitly keeps that guarantee obvious and the query lean.
const CARD_COLUMNS =
  "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, is_future, distance_meters, from_street, to_street";

type When = "current" | "future";
type RideType = "all" | "offer" | "get";

interface Params {
  when?: string;
  from?: string;
  to?: string;
  type?: string;
}

export default async function BrowseRidesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const when: When = sp.when === "future" ? "future" : "current";
  const rideType: RideType =
    sp.type === "offer" || sp.type === "get" ? sp.type : "all";
  const from =
    sp.from !== undefined ? sp.from.trim() : ((await cookies()).get("r4r-city")?.value.trim() ?? "");
  const to = sp.to?.trim() ?? "";
  const hasFilters = Boolean(from || to);

  // IP-suggested FROM city (v3 pilot): Vercel supplies a geo city header,
  // offered as the filter box's starting text — always changeable, and it
  // never acts as a filter by itself (the query above uses only the
  // explicit `from` param). Never auto-fills a post (P-2). Absent locally
  // and behind some proxies, in which case there is simply no suggestion.
  let geoCity = "";
  try {
    const rawGeo = (await headers()).get("x-vercel-ip-city");
    if (rawGeo) geoCity = decodeURIComponent(rawGeo).trim();
  } catch {
    geoCity = "";
  }
  const cityInputDefault = from || geoCity;

  // Build an href preserving current params, dropping empties.
  const hrefWith = (next: Partial<Params>) => {
    const merged = { when, type: rideType, from, to, ...next };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "when" && v === "current") && !(k === "type" && v === "all")) {
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

  const fromOr = from ? endOr("from", from) : null;
  const toOr = to ? endOr("to", to) : null;
  if (fromOr) query = query.or(fromOr);
  if (toOr) query = query.or(toOr);
  if (rideType !== "all") query = query.eq("type", rideType);

  // Capture the error. Discarding it here is how a totally broken database
  // rendered as "0 current rides" with HTTP 200 and nothing in the logs:
  // `data` comes back null on failure, which is indistinguishable from an
  // empty result unless you look at `error`. On a board whose entire purpose
  // is answering "did anyone post", a silent failure produces exactly the
  // reading that says nobody did.
  const { data: rides, error: ridesError } = await query
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<RideCardData[]>();

  if (ridesError) {
    // Server-side log: this is the signal that was missing entirely before.
    console.error("[rides] feed query failed:", ridesError.message, ridesError);
  }

  // Only meaningful when ridesError is null. Kept separate so an empty list
  // can never be produced by a failure.
  const list = rides ?? [];

  // Poster handles are full-details material: only resolve them for
  // signed-in viewers (same rule as the detail page). Signed-out viewers
  // get cards with no handle line rather than a wrong one.
  let handleById = new Map<string, string>();
  if (viewer && list.length > 0) {
    const { data: posters } = await supabase
      .from("profiles")
      .select("id, username")
      .in(
        "id",
        [...new Set(list.map((r) => r.owner_id))],
      )
      .returns<{ id: string; username: string }[]>();
    handleById = new Map((posters ?? []).map((p) => [p.id, p.username]));
  }
  const withHandles = list.map((r) => ({
    ...r,
    username: handleById.get(r.owner_id) ?? null,
  }));

  const tab = (value: When, label: string) => (
    <Link
      href={hrefWith({ when: value })}
      aria-current={when === value ? "page" : undefined}
      className={`inline-flex min-h-10 flex-1 items-center justify-center px-3 text-lg ${
        when === value
          ? "font-bold text-white"
          : "font-medium text-muted hover:text-content"
      }`}
    >
      {label}
    </Link>
  );

  // Ride-type tabs: plain labels on a shared hairline; the active one goes
  // bold white with a blue segment sitting on the line.
  const typeTab = (value: RideType, label: string) => {
    const isActive = rideType === value;
    return (
      <Link
        href={hrefWith({ type: value })}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex-1 pb-2 text-center text-sm ${
          isActive ? "font-bold text-white" : "font-medium text-muted hover:text-content"
        }`}
      >
        <span className="relative inline-block">
          {label}
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute -bottom-2 left-0 right-0 h-[3px] bg-primary"
            />
          ) : null}
        </span>
      </Link>
    );
  };

  return (
    <main className="w-full flex-1 px-4">
      {/* Current / Future tabs */}
      <div className="mb-6 flex rounded-2xl border border-white/20">
        {tab("current", "current rides")}
        {tab("future", "future rides")}
      </div>

      {/* Search (GET form → shareable URL) */}
      <form
        method="get"
        action="/rides"
        className="mb-6 flex items-center gap-2"
      >
        <input type="hidden" name="when" value={when} />
        <input type="hidden" name="type" value={rideType} />
        <input
          name="from"
          defaultValue={cityInputDefault}
          placeholder="city, zip or airport"
          aria-label="from"
          className="input min-w-0 flex-1 rounded-full px-4 text-center text-sm"
        />
        <span className="shrink-0 text-sm text-content">to</span>
        <input
          name="to"
          defaultValue={to}
          placeholder="city, zip or airport"
          aria-label="to"
          className="input min-w-0 flex-1 rounded-full px-4 text-center text-sm"
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
        {hasFilters ? (
          <Link
            href={hrefWith({ from: "", to: "" })}
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

      {/* Ride type tabs */}
      <div className="mb-6 flex border-b border-hairline">
        {typeTab("get", "need ride")}
        {typeTab("all", "all")}
        {typeTab("offer", "ride available")}
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
              href={hrefWith({ from: "", to: "" })}
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
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {withHandles.map((r) => (
            <li key={r.id}>
              <RideCard ride={r} />
            </li>
          ))}
        </ul>
      )}

    </main>
  );
}

/**
 * One search box matches a city name, a zip, a state code, or a
 * "city, st" pair — e.g. "aurora", "60505", "il", "chicago, il".
 */
function endOr(prefix: "from" | "to", raw: string | null): string | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .flatMap((part) => part.split(/\s+/).map((t) => t.trim()))
    .filter(Boolean);
  const parts: string[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) parts.push(`${prefix}_zip.eq.${t}`);
    else if (/^[a-zA-Z]{2}$/.test(t)) parts.push(`${prefix}_state.ilike.${t}`);
    else parts.push(`${prefix}_city.ilike.%${t}%`);
  }
  return parts.length > 0 ? parts.join(",") : null;
}
