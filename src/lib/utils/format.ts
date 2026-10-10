/** Format meters as US miles, e.g. 92000 -> "57 mi". */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  const miles = meters * 0.000621371;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Same distance in words, e.g. 1931 -> "1.2 miles", 1609 -> "1 mile". */
export function formatMiles(meters: number | null | undefined): string | null {
  const short = formatDistance(meters);
  if (!short) return null;
  return short.endsWith("1 mi") ? "1 mile" : short.replace(" mi", " miles");
}

/** 'HH:MM' 24h -> 'h:mm a.m', e.g. "14:30" -> "2:30 p.m". */
export function formatClock(hhmm: string): string {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? "a.m" : "p.m";
  return `${h24 % 12 || 12}:${m[2]} ${suffix}`;
}

/** 'HH:MM' 24h -> 'h.mm a.m', e.g. "13:45" -> "1.45 p.m" (card headline). */
export function formatClockDots(hhmm: string): string {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? "a.m" : "p.m";
  return `${h24 % 12 || 12}.${m[2]} ${suffix}`;
}

/** Posted time, e.g. "Today • 10:05 a.m". Days compare in server time. */
export function formatPostedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000),
  );
  const day =
    dayDiff <= 0
      ? "Today"
      : dayDiff === 1
        ? "Yesterday"
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const h24 = d.getHours();
  const suffix = h24 < 12 ? "a.m" : "p.m";
  const h = h24 % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} • ${h}:${mm} ${suffix}`;
}

/** Human-readable ride timing. */
export function formatRideWhen(rideDate: string | null, isFuture: boolean): string {
  if (!rideDate) return "current · asap";
  const d = new Date(rideDate + "T00:00:00");
  const label = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return isFuture ? label : `current · ${label}`;
}

/** e.g. "Riverside, CA 92501" (zip optional). */
export function formatPlace(
  city: string,
  state: string,
  zip?: string | null,
): string {
  return `${city}, ${state}${zip ? ` ${zip}` : ""}`;
}
