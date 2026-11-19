import {
  addDays,
  formatMonthDay,
  todayInZone,
  timezoneForState,
} from "@/lib/pickup-tz";

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

/** 'HH:MM' 24h -> 'h:mm am', e.g. "14:30" -> "2:30 pm". */
export function formatClock(hhmm: string): string {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? "am" : "pm";
  return `${h24 % 12 || 12}:${m[2]} ${suffix}`;
}

/** 'HH:MM' 24h -> 'h.mm am', e.g. "13:45" -> "1.45 pm" (card headline). */
export function formatClockDots(hhmm: string): string {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? "am" : "pm";
  return `${h24 % 12 || 12}.${m[2]} ${suffix}`;
}

/** Posted time, e.g. "Today • 10:05 am". Days compare in server time. */

/**
 * USPS street suffixes to their short forms. Applied to the trailing
 * word only ("Newberry Court" -> "Newberry Ct", "East New York Street"
 * -> "East New York St"), so name words like "Saint" are never touched.
 */
const STREET_SUFFIXES: Record<string, string> = {
  avenue: "Ave",
  boulevard: "Blvd",
  circle: "Cir",
  court: "Ct",
  drive: "Dr",
  lane: "Ln",
  parkway: "Pkwy",
  place: "Pl",
  plaza: "Plz",
  road: "Rd",
  square: "Sq",
  street: "St",
  terrace: "Ter",
  trail: "Trl",
};

export function abbreviateStreet(street: string | null): string | null {
  if (!street) return street;
  const trimmed = street.trim();
  const m = /^(.*\s)?([A-Za-z]+)\.?$/.exec(trimmed);
  if (!m) return trimmed;
  const short = STREET_SUFFIXES[m[2].toLowerCase()];
  if (!short) return trimmed;
  return `${m[1] ?? ""}${short}`;
}
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
  const suffix = h24 < 12 ? "am" : "pm";
  const h = h24 % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} • ${h}:${mm} ${suffix}`;
}

/** Ride detail timing line: "Today", "Tomorrow", or "Nov 20" from the
 *  ride date in the pickup's local day. Undated rides read as today. */
export function formatRideWhen(
  rideDate: string | null,
  fromState: string,
): string {
  const tz = timezoneForState(fromState);
  const today = todayInZone(tz);
  if (!rideDate || rideDate <= today) return "Today";
  if (rideDate === addDays(today, 1)) return "Tomorrow";
  return formatMonthDay(rideDate);
}

/** e.g. "Riverside, CA 92501" (zip optional). */
export function formatPlace(
  city: string,
  state: string,
  zip?: string | null,
): string {
  return `${city}, ${state}${zip ? ` ${zip}` : ""}`;
}

/**
 * Whole years between a YYYY-MM-DD date and now (for "Male, 24 years").
 * Null when there is no usable date.
 */
export function formatAge(ymd: string | null, now: Date = new Date()): number | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < m ||
    (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** "Mon YYYY" for "Joined Nov 2026". Empty string when unusable. */
export function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Relative activity for the profile line ("55 Minutes ago", "2 Hours
 * ago", "3 Days ago"). Units read capitalized per the profile design.
 * Null when there is nothing recent to show (or no timestamp at all).
 */
export function formatActiveAgo(
  iso: string | null,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} Minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} Day${days === 1 ? "" : "s"} ago`;
  return null;
}
