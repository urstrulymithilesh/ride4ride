import Link from "next/link";
import { CopyLinkButton } from "@/components/rides/copy-link-button";
import { formatDistance, formatPlace, formatRideWhen } from "@/lib/utils/format";

/**
 * The subset of `rides` shown on a public card. Deliberately NO address /
 * coordinate fields — those live in the row-protected `ride_locations` table
 * and are never part of a public query.
 */
export interface RideCardData {
  id: string;
  type: "offer" | "get";
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  ride_date: string | null;
  is_future: boolean;
  distance_meters: number | null;
  from_street: string | null; // masked, no number; 'get' only
  to_street: string | null; // masked, no number; 'get' only
  from_airport: string | null; // public IATA display/filter aid
}

export function RideCard({ ride }: { ride: RideCardData }) {
  const distance = formatDistance(ride.distance_meters);
  // Masked street tier (v3): rider posts show "Main St · Riverside, CA".
  const fromLabel =
    ride.type === "get" && ride.from_street
      ? `${ride.from_street} · ${formatPlace(ride.from_city, ride.from_state)}`
      : formatPlace(ride.from_city, ride.from_state);
  const toLabel =
    ride.type === "get" && ride.to_street
      ? `${ride.to_street} · ${formatPlace(ride.to_city, ride.to_state)}`
      : formatPlace(ride.to_city, ride.to_state);

  return (
    <article className="card flex flex-col overflow-hidden border border-hairline p-0 shadow-[0_10px_28px_-18px_rgba(14,30,51,0.25)] transition-shadow hover:shadow-[0_18px_36px_-18px_rgba(37,99,235,0.35)]">
      <Link href={`/rides/${ride.id}`} className="block flex-1 p-4">
        <span
          className={`chip ${
            ride.type === "offer"
              ? "bg-success-soft text-success"
              : "bg-primary-soft text-primary"
          }`}
        >
          {ride.type === "offer" ? "ride available" : "need ride"}
        </span>
        <p className="wrap-anywhere mt-2 font-semibold text-content">
          {fromLabel} → {toLabel}
        </p>
        {ride.from_airport ? (
          <p className="mt-1 text-xs font-medium text-muted">
            ✈ {ride.from_airport}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted">
          {formatRideWhen(ride.ride_date, ride.is_future)}
          {distance ? ` · ${distance}` : ""}
        </p>
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2">
        <Link
          href={`/rides/${ride.id}`}
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary"
        >
          view details →
        </Link>
        <CopyLinkButton path={`/rides/${ride.id}`} compact />
      </div>
    </article>
  );
}
