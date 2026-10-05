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
    <article>
      <div className="flex items-center gap-3 rounded-[20px] border border-white/15 bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="wrap-anywhere text-xl font-semibold">
            <span className={ride.type === "offer" ? "text-primary" : "text-success"}>
              {headline}
            </span>
          </p>
          <div className="mt-2 flex flex-col gap-1 text-[13px] leading-snug text-muted">
            <p className="wrap-anywhere">pick up : {fromLabel}</p>
            <p className="wrap-anywhere">drop off : {toLabel}</p>
          </div>
        </div>
        <Link
          href={`/rides/${ride.id}`}
          className="btn btn-primary min-h-11 shrink-0 self-center rounded-[10px] px-5 text-sm"
        >
          request
        </Link>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="wrap-anywhere truncate text-sm text-white/80">
          {ride.username ? `@${ride.username}` : ""}
        </p>
        <p className="shrink-0 text-xs text-muted">
          {formatPostedAt(ride.created_at)}
        </p>
      </div>
    </article>
  );
}
