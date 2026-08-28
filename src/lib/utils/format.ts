/** Format meters as US miles, e.g. 92000 -> "57 mi". */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  const miles = meters * 0.000621371;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Human-readable ride timing. */
export function formatRideWhen(rideDate: string | null, isFuture: boolean): string {
  if (!rideDate) return "Current · ASAP";
  const d = new Date(rideDate + "T00:00:00");
  const label = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return isFuture ? label : `Current · ${label}`;
}

/** e.g. "Riverside, CA 92501" (zip optional). */
export function formatPlace(
  city: string,
  state: string,
  zip?: string | null,
): string {
  return `${city}, ${state}${zip ? ` ${zip}` : ""}`;
}
