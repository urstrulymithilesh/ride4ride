import Link from "next/link";
import { formatMiles, formatPlace, formatPostedAt } from "@/lib/utils/format";

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
  distance_meters: number | null;
  from_street: string | null; // masked, no number; 'get' only
  to_street: string | null; // masked, no number; 'get' only
  username: string | null;
}

export function RideCard({ ride }: { ride: RideCardData }) {
  const miles = formatMiles(ride.distance_meters);
  // Masked street tier (v3): rider posts show "Main St · Riverside, CA".
  // Exact addresses stay private until both sides agree (reveal flow).
  const fromLabel =
    ride.type === "get" && ride.from_street
      ? `${ride.from_street} · ${formatPlace(ride.from_city, ride.from_state)}`
      : formatPlace(ride.from_city, ride.from_state);
  const toLabel =
    ride.type === "get" && ride.to_street
      ? `${ride.to_street} · ${formatPlace(ride.to_city, ride.to_state)}`
      : formatPlace(ride.to_city, ride.to_state);
  const headline =
    ride.type === "offer"
      ? `ride available${miles ? ` for ${miles}` : ""}`
      : `need ride${miles ? ` for ${miles}` : ""}`;

  return (
    <article className="rounded-[20px] border border-white/15 bg-surface p-3">
      <div className="flex items-center gap-3">
        <p className="wrap-anywhere min-w-0 flex-1 text-xl font-semibold">
          <span className={ride.type === "offer" ? "text-primary" : "text-success"}>
            {headline}
          </span>
        </p>
        <Link
          href={`/rides/${ride.id}`}
          className="btn btn-primary min-h-8 shrink-0 self-center rounded-[10px] px-5 text-sm"
        >
          request
        </Link>
      </div>
      <div className="mt-2 flex flex-col gap-1 text-[13px] leading-snug text-white/80">
        <p className="wrap-anywhere">
          {ride.type === "offer" ? "from : " : "pick up : "}
          {fromLabel}
        </p>
        <p className="wrap-anywhere">
          {ride.type === "offer" ? "to : " : "drop off : "}
          {toLabel}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
        <p className="wrap-anywhere flex min-w-0 items-center gap-1.5 truncate text-sm text-white/80">
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
            className="shrink-0"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
          </svg>
          <span className="truncate">
            {ride.username ?? ""}
          </span>
        </p>
        <p className="shrink-0 text-xs text-muted">
          {formatPostedAt(ride.created_at)}
        </p>
      </div>
    </article>
  );
}
