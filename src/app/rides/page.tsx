import Link from "next/link";
import type { Metadata } from "next";
import { searchPlaces } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import type { RideCardData } from "@/components/rides/ride-card";
import { SearchForm } from "@/components/places/search-form";
import { RidesMap } from "@/components/rides/rides-map";
import { buildMapRides } from "@/lib/ride-geo.server";
import { recordArrival } from "@/lib/arrivals";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Browse rides" };

// Named columns only — NEVER select *. The `rides` table has no address
// columns (those live in the row-protected `ride_locations` table), and
// listing them explicitly keeps that guarantee obvious and the query lean.
const CARD_COLUMNS =
  "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, time_mode, ride_time, distance_meters, from_street, to_street, from_airport, pin_lat, pin_lng, description";

// Same columns minus migration 0019's timing pair — the degraded fallback
// when those columns don't exist yet.
const BASE_CARD_COLUMNS =
  "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, distance_meters, from_street, to_street, description";

type RideType = "offer" | "get";

interface Params {
  from?: string;
  to?: string;
  airport?: string;
  university?: string;
}

/**
 * The feed, shared by both routes. The ROUTE picks the ride type, never
 * the URL: `/` is need-ride (hail), `/rides` is ride-available (car).
 * `?type=` links are legacy — the proxy strips them (see proxy.ts).
 */
export function BrowseRidesPage({
  searchParams,
  rideType,
}: {
  searchParams: Promise<Params>;
  rideType: RideType;
}) {
  return <FeedInner searchParams={searchParams} rideType={rideType} />;
}

/** `/rides` serves the ride-available feed. */
export default function RidesRoutePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return <BrowseRidesPage searchParams={searchParams} rideType="offer" />;
}

async function FeedInner({
  searchParams,
  rideType,
}: {
  searchParams: Promise<Params>;
  rideType: RideType;
}) {
  const sp = await searchParams;

  // No current/future split anymore: each tab shows every ride of its
  // type, newest first. Timing lives on the pills, not in tabs.

  // Search is literal from→to text. Location scoping is no longer
  // inferred from IP: the map centers on the viewer's device and every
  // active ride is returned, nearest-first in the client.
  const resolvePlace = (raw: string): { text: string; university: boolean } => {
    const text = raw.trim();
    if (!text) return { text, university: false };
    // Airport title or bare code ("Chicago O'Hare (ORD)" or "ORD").
    // Matched structurally — a full-title round-trip through searchPlaces
    // need not return the title itself for this to scope correctly.
    const code =
      text.match(/\(([A-Z]{3})\)\s*$/)?.[1] ??
      (/^[A-Z]{3}$/.test(text) ? text : null);
    if (code) {
      const known = searchPlaces(code, "airport", 5).some((r) =>
        r.title.includes(`(${code})`),
      );
      if (known) return { text: code, university: false };
    }
    // University title or bare name ("Lewis University · Romeoville, IL"
    // or "Lewis University").
    const name = text.split("·")[0]?.trim() || text;
    if (
      searchPlaces(name, "university", 5).some(
        (r) =>
          r.title.split("·")[0]?.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      return { text: name, university: true };
    }
    // City text (or anything else): exact title hit keeps the canonical
    // value, otherwise the raw text tokenizes downstream.
    const hit = searchPlaces(text, "all", 5).find(
      (r) => r.title.toLowerCase() === text.toLowerCase(),
    );
    if (!hit) return { text, university: false };
    if (hit.kind === "university") {
      const uni = hit.title.split("·")[0]?.trim() || hit.title;
      return { text: uni, university: true };
    }
    // Airport titles read "Name (ORD)"; scope the bare IATA code so the
    // airport equality below matches tagged posts.
    if (hit.kind === "airport") {
      const c = hit.title.match(/\(([A-Z]{3})\)\s*$/)?.[1];
      return { text: c ?? hit.value, university: false };
    }
    return { text: hit.value, university: false };
  };
  const fromPlace = resolvePlace(sp.from ?? "");
  const toPlace = resolvePlace(sp.to?.trim() ?? "");
  const from = fromPlace.text;
  const to = toPlace.text;

  // Airport scope (?airport=ORD): strict IATA only, and only for codes
  // in our airports table — anything else is ignored, never queried.
  const airportCode = (sp.airport ?? "").trim().toUpperCase();
  const airportHit = /^[A-Z]{3}$/.test(airportCode)
    ? searchPlaces(airportCode, "airport", 5).find((r) =>
        r.title.includes(`(${airportCode})`),
      )
    : undefined;
  const airportValid = airportHit !== undefined;
  // Airport city for the drop-off side of the OR: there is no to_airport
  // column, so a dropoff "containing" the airport means the airport's own
  // city (ORD -> Chicago, IL).
  const airportCity = airportHit?.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const airportLabel = airportHit?.title ?? (airportValid ? airportCode : "");

  // University scope (?university=Lewis University): validated against
  // the vendored dataset — anything else is ignored, never queried. With
  // no university column, the description is the only literal signal, and
  // one ilike covers either end of the trip.
  const uniRaw = (sp.university ?? "").trim();
  const uniHit = uniRaw
    ? searchPlaces(uniRaw, "university", 5).find(
        (r) =>
          r.title.split("·")[0]?.trim().toLowerCase() ===
          uniRaw.toLowerCase(),
      )
    : undefined;
  const university = uniHit?.title.split("·")[0]?.trim() ?? "";

  // Build an href preserving current params, dropping empties. Only
  // explicitly typed text travels in URLs. Stays on the current tab's
  // route (/ for hail, /rides for car).
  const hrefWith = (next: Partial<Params>) => {
    const base = rideType === "offer" ? "/rides" : "/";
    const merged = {
      from: sp.from?.trim() ?? "",
      to: sp.to?.trim() ?? "",
      airport: sp.airport?.trim() ?? "",
      university: sp.university?.trim() ?? "",
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) {
        qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  // Arrival tracking (T13). Fire before the feed query so a slow or
  // failing database does not cost us the one signal that tells a dead
  // link apart from a dead product.
  const viewer = await getUser();
  await recordArrival("feed", viewer?.id);

  const supabase = await createClient();
  // Columns from migration 0019. Factored so the feed can retry without
  // them when the migration hasn't applied yet (degraded timing: ASAP).
  //
  // One scope per filter group. A single scope behaves exactly like a
  // plain from→to query; multiple scopes run in parallel and union by id,
  // which is how pick up AND drop off narrow to the route while airport
  // and university broaden to either end of the trip.
  const buildQuery = (
    columns: string,
    scope: "route" | "airport" | "uni",
    opts?: { noAirport?: boolean },
  ) => {
    let q = supabase
      .from("rides")
      .select(columns)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .eq("type", rideType);

    if (scope === "route") {
      const fromTokens = endTokens(from);
      const toTokens = endTokens(to);
      // University scope/search matches post text: with no university
      // column, the description is the only literal signal. Everything
      // else keeps the city/state/zip/airport token logic.
      if (fromPlace.university) q = q.ilike("description", `%${from}%`);
      else
        for (const t of fromTokens) {
          if (/^\d+$/.test(t)) q = q.eq("from_zip", t);
          // Strict-uppercase 3 letters = a literal airport pick. Lowercase
          // 3-letter text falls through to the city match below.
          else if (/^[A-Z]{3}$/.test(t)) {
            if (!opts?.noAirport) q = q.eq("from_airport", t);
          } else if (/^[a-zA-Z]{2}$/.test(t)) q = q.ilike("from_state", t);
          else q = q.ilike("from_city", `%${t}%`);
        }
      if (toPlace.university) q = q.ilike("description", `%${to}%`);
      else
        for (const t of toTokens) {
          if (/^\d+$/.test(t)) q = q.eq("to_zip", t);
          else if (/^[a-zA-Z]{2}$/.test(t)) q = q.ilike("to_state", t);
          else q = q.ilike("to_city", `%${t}%`);
        }
    }

    if (scope === "airport" && airportValid && !opts?.noAirport) {
      // Pickup side is the tagged IATA code; drop-off side is the
      // airport's own city (there is no to_airport column). The degraded
      // retry drops this scope entirely (no from_airport column).
      const [city, state] = airportCity ?? [];
      q =
        city && state
          ? q.or(
              `from_airport.eq.${airportCode},and(to_city.ilike.%${city}%,to_state.ilike.${state}%)`,
            )
          : q.eq("from_airport", airportCode);
    }

    if (scope === "uni" && university)
      q = q.ilike("description", `%${university}%`);

    return q
      .order("created_at", { ascending: false })
      .limit(120)
      .returns<RideCardData[]>();
  };

  // Chip combination: OR across scopes, AND inside the route scope. With
  // no chips set the route scope is unfiltered, preserving the old
  // show-everything board.
  const scopes: ("route" | "airport" | "uni")[] = [];
  if (from.trim() || to.trim()) scopes.push("route");
  if (airportValid) scopes.push("airport");
  if (university) scopes.push("uni");
  if (scopes.length === 0) scopes.push("route");

  const runScopes = async (
    columns: string,
    opts?: { noAirport?: boolean },
  ) => {
    // The degraded retry has no from_airport column, so the airport scope
    // (which needs it) is dropped there instead of erroring.
    const active = opts?.noAirport
      ? scopes.filter((s) => s !== "airport")
      : scopes;
    const runs = active.length > 0 ? active : (["route"] as const);
    const out = await Promise.all(
      runs.map((scope) => buildQuery(columns, scope, opts)),
    );
    const seen = new Set<string>();
    const data: RideCardData[] = [];
    let error: (typeof out)[number]["error"] = null;
    for (const r of out) {
      if (r.error && !error) error = r.error;
      for (const row of r.data ?? []) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          data.push(row);
        }
      }
    }
    data.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return { data: data.slice(0, 120), error };
  };

  // Capture the error. Discarding it here is how a totally broken database
  // rendered as "0 current rides" with HTTP 200 and nothing in the logs:
  // `data` comes back null on failure, which is indistinguishable from an
  // empty result unless you look at `error`.
  let { data: rides, error: ridesError } = await runScopes(CARD_COLUMNS);

  // A missing timing, airport, or pin column is an expected state until
  // migrations 0019/0021/0022 are applied, so it warns instead of erroring.
  const pendingMigration = Boolean(
    ridesError && /time_mode|ride_time|from_airport|pin_lat|pin_lng/i.test(ridesError.message),
  );
  if (ridesError && !pendingMigration) {
    console.error("[rides] feed query failed:", ridesError.message, ridesError);
  }

  if (pendingMigration && ridesError) {
    console.warn(
      "[rides] timing/airport/pin columns missing — apply migrations 0019_ride_timing.sql, 0021_airports.sql, and 0022_pin_points.sql.",
    );
    const retry = await runScopes(BASE_CARD_COLUMNS, { noAirport: true });
    rides = (retry.data ?? []).map((r) => ({
      ...r,
      time_mode: "asap" as const,
      ride_time: null,
      from_airport: null,
      pin_lat: null,
      pin_lng: null,
    }));
    ridesError = retry.error;
    if (ridesError) {
      console.error(
        "[rides] fallback feed query failed:",
        ridesError.message,
        ridesError,
      );
    }
  }

  const list = rides ?? [];

  // Feed map pins and clusters. Exact pickup points never leave
  // ride_locations — the public pin is pre-jittered at post time.
  const mapRides = buildMapRides(list);

  // Ride-type tabs live in the feed's bottom bar (see BottomNav's
  // FeedDock); the page itself renders no tab bar.

  return (
    <>
      {/* Full-bleed map backdrop. Need-ride shows per-ride pins;
          ride-available shows city clusters. Both pan and zoom. Zoom
          limits are per-tab: need-ride stays close (10-17), ride-available
          opens wide (4-12). */}
      <RidesMap
        rides={mapRides}
        interactive
        minZoom={rideType === "get" ? 10 : 4}
        maxZoom={rideType === "get" ? 17 : 12}
        landingZoom={rideType === "get" ? 10 : 10}
        cluster={rideType === "offer"}
      />

      {/* Floating filter chips at the top of the feed. Chip dropdown
          behavior: pick up / drop off filter the feed; airport and
          university set the chip label until their behavior lands. */}
      <div data-feed-search className="pointer-events-auto fixed inset-x-0 top-0 z-[var(--z-chrome)] mx-auto w-full max-w-[480px] px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <SearchForm
          key={`${sp.from?.trim() ?? ""}|${to}|${airportCode}|${sp.university?.trim() ?? ""}`}
          type={rideType}
          fromDefault={sp.from?.trim() || airportLabel || university}
          toDefault={to}
        />
      </div>

      <main className="pointer-events-none relative z-10 flex w-full flex-1 flex-col pb-4">
        {/* The ride-type switch is the feed's bottom bar (BottomNav);
            nothing floats between the search rows and it. */}

        {ridesError ? (
          /* ERROR state — deliberately NOT the empty state. An empty board and
             a broken board mean opposite things and must never look alike. */
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4">
            <div
              role="alert"
              className="glass pointer-events-auto w-full max-w-sm rounded-2xl border border-danger/60 p-6 text-center"
            >
              <p className="text-sm font-semibold text-content">
                Couldn&apos;t load rides.
              </p>
              <p className="mt-1 text-sm text-muted">
                Something went wrong on our side, so we can&apos;t show the
                board right now. This is not the same as there being no rides.
              </p>
              <Link
                href={hrefWith({})}
                className="mt-3 inline-block text-sm font-medium text-primary"
              >
                Try again
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

/**
 * Split one search box into match tokens: a city name, a zip, a state
 * code, or a "city, st" pair — e.g. "aurora", "60505", "il",
 * "chicago, il". Callers AND the tokens together ("Lemont, IL" needs the
 * city AND the state — OR-ing them matches the whole state).
 */
function endTokens(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .flatMap((part) => part.split(/\s+/).map((t) => t.trim()))
    .filter(Boolean);
}
