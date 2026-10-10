import Link from "next/link";
import { FitHeadline } from "@/components/rides/fit-headline";
import { formatClockDots, formatMiles, formatPlace, formatPostedAt } from "@/lib/utils/format";

/**
 * The subset of `rides` shown on a public card. Deliberately NO address /
 * coordinate fields — those live in the row-protected `ride_locations` table
 * and are never part of a public query. `username` is attached by the page
 * and is null for signed-out viewers (poster identity is full-details
 * material, same rule as the detail page).
 */
export interface RideCardData {
  id: string;
  type: "offer" | "get";
  owner_id: string;
  created_at: string;
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  ride_date: string | null;
  is_future: boolean;
  time_mode: "asap" | "anytime" | "at";
  ride_time: string | null;
  distance_meters: number | null;
  from_street: string | null; // masked, no number; 'get' only
  to_street: string | null; // masked, no number; 'get' only
  description: string | null;
  username: string | null;
}

export function RideCard({
  ride,
  signedIn,
}: {
  ride: RideCardData;
  signedIn: boolean;
}) {
  const miles = formatMiles(ride.distance_meters);
  // Masked street tier (v3): rider posts show "Main St • Riverside, CA".
  // Exact addresses stay private until both sides agree (reveal flow).
  const fromLabel =
    ride.type === "get" && ride.from_street
      ? `${ride.from_street} • ${formatPlace(ride.from_city, ride.from_state)}`
      : formatPlace(ride.from_city, ride.from_state);
  const toLabel =
    ride.type === "get" && ride.to_street
      ? `${ride.to_street} • ${formatPlace(ride.to_city, ride.to_state)}`
      : formatPlace(ride.to_city, ride.to_state);
  const base =
    ride.type === "offer"
      ? "ride available"
      : "need ride";
  const headline = `${base}${miles ? ` for ${miles}` : ""}`;
  // Timing folds into the headline: ", @1.45 p.m" for a set time,
  // "- now" for asap, "- anytime" for flexible.
  const timingSuffix =
    ride.time_mode === "at" && ride.ride_time
      ? `, @${formatClockDots(ride.ride_time)}`
      : ride.time_mode === "anytime"
        ? " - anytime"
        : " - now";

  return (
    <article className="rounded-[20px] border border-white/15 bg-app px-4 pb-3 pt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-[20px] text-white">
            {ride.username ? (
              <Link href={`/${ride.username}`} className="hover:underline">
                @{ride.username}
              </Link>
            ) : (
              "new post"
            )}
          </p>
          <p className="mt-0.5 text-[9px] leading-[12px] text-muted">
            {formatPostedAt(ride.created_at)}
          </p>
        </div>
        <Link
          href={`/rides/${ride.id}`}
          aria-label="post details"
          className="flex h-11 w-11 shrink-0 items-start justify-end text-lg font-bold tracking-widest text-muted"
        >
          <span aria-hidden="true" className="leading-[20px]">...</span>
        </Link>
      </div>
      {/* Always a single sentence: shrinks to fit, ellipsis only if it
          still overflows at the minimum size. */}
      <FitHeadline text={`${headline}${timingSuffix}`} />
      <div className="mt-1.5 flex items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
          <p className="wrap-anywhere">
            {ride.type === "offer" ? "from : " : "pick up : "}
            {fromLabel}
          </p>
          <p className="wrap-anywhere mt-1">
            {ride.type === "offer" ? "to : " : "drop off : "}
            {toLabel}
          </p>
        </div>
        <Link
          href={`/rides/${ride.id}`}
          aria-label="request"
          className="btn btn-primary min-h-11 shrink-0 self-center rounded-[10px] px-4 text-sm"
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
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
      {/* Note box: free text, so same gate as handles — signed-in only.
          Signed-out viewers get no box rather than a wrong one. */}
      {signedIn && ride.description?.trim() ? (
        <p className="mt-2 truncate rounded-[10px] border border-white/15 px-3 py-2 text-[13px]">
          <span className="font-semibold text-muted">note: </span>
          <span className="text-white">{ride.description.trim()}</span>
        </p>
      ) : null}
    </article>
  );
}
