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
}

export function RideCard({ ride }: { ride: RideCardData }) {
  const distance = formatDistance(ride.distance_meters);

  return (
    <article className="card flex flex-col p-0">
      <Link href={`/rides/${ride.id}`} className="block flex-1 p-4">
        <span
          className={`chip ${
            ride.type === "offer"
              ? "bg-success-soft text-success"
              : "bg-primary-soft text-primary"
          }`}
        >
          {ride.type === "offer" ? "Offer" : "Get"} a ride
        </span>
        <p className="wrap-anywhere mt-2 font-semibold text-content">
          {formatPlace(ride.from_city, ride.from_state)} →{" "}
          {formatPlace(ride.to_city, ride.to_state)}
        </p>
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
          View details →
        </Link>
        <CopyLinkButton path={`/rides/${ride.id}`} compact />
      </div>
    </article>
  );
}
