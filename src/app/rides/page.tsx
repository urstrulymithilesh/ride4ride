import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocationFromHeaders } from "@/lib/location-server";
import { searchPlaces } from "@/lib/places";
import { formatLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";
import { EmptyPostCta } from "@/components/rides/empty-post-cta";
import { SearchForm } from "@/components/places/search-form";
import { LocationPicker } from "@/components/layout/location-picker";
import { recordArrival } from "@/lib/arrivals";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "browse rides" };

// Named columns only — NEVER select *. The `rides` table has no address
// columns (those live in the row-protected `ride_locations` table), and
// listing them explicitly keeps that guarantee obvious and the query lean.
const CARD_COLUMNS =
  "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, is_future, time_mode, ride_time, distance_meters, from_street, to_street, from_airport, description";

// Same columns minus migration 0019's timing pair — the degraded fallback
// when those columns don't exist yet.
const BASE_CARD_COLUMNS =
  "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, is_future, distance_meters, from_street, to_street, description";

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
  // Scoping vs search. The feed is always scoped: explicit ?from= wins,
  // else the saved city override, else the IP-detected city. An explicit
  // empty ?from= (clear) means unscoped. Only typed text counts as
  // "searched" for the X button and empty-state copy.
  const cookieCity = ((await cookies()).get("r4r-city")?.value ?? "").trim();
  const detected = await getLocationFromHeaders();
  const detectedLabel = detected ? formatLocation(detected) : "";
  // A picked place name resolves to its filterable form — with one
  // exception: a university title ("Name · City, ST") matches on its
  // bare name. Rides carry no university column, so city substitution
  // would match every post in town instead of university posts; the
  // description text is the literal signal and matching uses the name
  // ("Lewis University"), never the suffixed title. Anything else
  // filters literally, as before. Only a full display-name match
  // resolves, so partial typing keeps the old substring behavior.
  // Strict-uppercase IATA codes are exempt — the airport branch below
  // scopes those verbatim. The saved scope goes through the same
  // resolution, so a stored university title matches by name too.
  const resolvePlace = (raw: string): { text: string; university: boolean } => {
    const text = raw.trim();
    if (!text || /^[A-Z]{3}$/.test(text)) return { text, university: false };
    const hit = searchPlaces(text, "all", 5).find(
      (r) => r.title.toLowerCase() === text.toLowerCase(),
    );
    if (!hit) return { text, university: false };
    if (hit.kind === "university") {
      const name = hit.title.split("·")[0]?.trim() || hit.title;
      return { text: name, university: true };
    }
    // Airport titles read "Name (ORD)"; scope the bare IATA code so the
    // airport equality below matches tagged posts.
    if (hit.kind === "airport") {
      const code = hit.title.match(/\(([A-Z]{3})\)\s*$/)?.[1];
      return { text: code ?? hit.value, university: false };
    }
    return { text: hit.value, university: false };
  };
  const fromPlace =
    sp.from !== undefined
      ? resolvePlace(sp.from)
      : resolvePlace(cookieCity || detectedLabel);
  const toPlace = resolvePlace(sp.to?.trim() ?? "");
  const from = fromPlace.text;
  const to = toPlace.text;
  const searched = Boolean(sp.from?.trim() || to);
  const scopedNote = !searched && from ? ` near ${from}` : "";
  const hasFilters = searched;

  // Build an href preserving current params, dropping empties.
  // Only explicitly typed text travels in URLs — the implicit scoped
  // city must never leak in, or every tab switch would look "searched".
  const hrefWith = (next: Partial<Params>) => {
    const merged = {
      when,
      type: rideType,
      from: sp.from?.trim() ?? "",
      to: sp.to?.trim() ?? "",
      ...next,
    };
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
  // Columns from migration 0019. Factored so the feed can retry without
  // them when the migration hasn't applied yet (degraded timing: ASAP).
  const buildQuery = (columns: string, opts?: { noAirport?: boolean }) => {
    let q = supabase
      .from("rides")
      .select(columns)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .eq("is_future", when === "future");

    const fromTokens = endTokens(from);
    const toTokens = endTokens(to);
    // University scope/search matches post text: with no university
    // column, the description is the only literal signal. Everything
    // else keeps the city/state/zip/airport token logic.
    if (fromPlace.university) q = q.ilike("description", `%${from}%`);
    else
      for (const t of fromTokens) {
        if (/^\d+$/.test(t)) q = q.eq("from_zip", t);
        // Strict-uppercase 3 letters = a literal airport pick (the picker
        // scopes IATA codes verbatim). Lowercase 3-letter text falls through
        // to the city match below, so prefix typing never hijacks to airports.
        // Skipped in the no-column fallback: filtering on a missing column
        // fails the whole query, which is how an airport scope became the
        // error board instead of a degraded list.
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
    if (rideType !== "all") q = q.eq("type", rideType);

    return q
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<RideCardData[]>();
  };

  // Capture the error. Discarding it here is how a totally broken database
  // rendered as "0 current rides" with HTTP 200 and nothing in the logs:
  // `data` comes back null on failure, which is indistinguishable from an
  // empty result unless you look at `error`. On a board whose entire purpose
  // is answering "did anyone post", a silent failure produces exactly the
  // reading that says nobody did.
  let { data: rides, error: ridesError } = await buildQuery(CARD_COLUMNS);

  // A missing timing or airport column is an expected state until
  // migrations 0019/0021 are applied, so it warns instead of erroring
  // (a red console for every page view trains you to ignore red). Any
  // other failure keeps the loud log — that is the signal that was
  // missing entirely before.
  const pendingMigration = Boolean(
    ridesError && /time_mode|ride_time|from_airport/i.test(ridesError.message),
  );
  if (ridesError && !pendingMigration) {
    console.error("[rides] feed query failed:", ridesError.message, ridesError);
  }

  if (pendingMigration && ridesError) {
    // Migration 0019 (timing) or 0021 (airports) hasn't applied: retry
    // without those columns (cards fall back to ASAP / no airport chip)
    // instead of blanking the whole board. The airport equality is
    // dropped too — it names the same missing column, so keeping it
    // would fail the retry right back into the error board. Airport
    // scopes stay broad until 0021 applies.
    console.warn(
      "[rides] timing/airport columns missing — apply migrations 0019_ride_timing.sql and 0021_airports.sql.",
    );
    const retry = await buildQuery(BASE_CARD_COLUMNS, { noAirport: true });
    rides = (retry.data ?? []).map((r) => ({
      ...r,
      time_mode: "asap" as const,
      ride_time: null,
      from_airport: null,
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
      {/* Search — client form with autocomplete dropdowns; the query
          itself stays in shareable ?from=&to= params. */}
      <SearchForm
        when={when}
        type={rideType}
        fromDefault={sp.from?.trim() ?? ""}
        toDefault={to}
        clearHref={hrefWith({ from: "", to: "" })}
        showClear={hasFilters}
      />

      {/* Ride type tabs */}
      <div className="mb-4 flex border-b border-hairline">
        {typeTab("get", "need ride")}
        {typeTab("all", "all")}
        {typeTab("offer", "ride available")}
      </div>

      {/* Scoped location readout + picker. */}
      <div className="mb-6 flex justify-center">
        <LocationPicker detected={detected} />
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
              : scopedNote
                ? `no ${when} rides${scopedNote} yet.`
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
            <EmptyPostCta />
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {withHandles.map((r) => (
            <li key={r.id}>
              <RideCard ride={r} signedIn={Boolean(viewer)} />
            </li>
          ))}
        </ul>
      )}

    </main>
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
