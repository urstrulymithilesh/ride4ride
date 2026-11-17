/**
 * Pickup timezone derived from the US state code. Single source of truth
 * for everything day-boundary-shaped: the posting form's Today/Tomorrow
 * labels, server date validation, the map pill cascade, and (mirrored as
 * a SQL CASE in migration 0025) the expiry trigger. If either copy
 * changes, update the other — they are pointed at each other.
 *
 * Split states take the majority side for now (documented below); a
 * per-city lookup is the planned real solution. Unknown/empty states
 * fall back to UTC, which is deterministic if never local.
 */

// Majority-side picks for split states: FL/IN/KY/MI Eastern; TN/AL-outside?
// TN Central (Nashville+Memphis outweigh Knoxville); ND/SD/NE/KS Central;
// TX Central (El Paso is Mountain); OR/NV Pacific; ID Mountain (Boise).
// Arizona mostly skips daylight saving, so America/Phoenix (fixed -07),
// NOT America/Denver.
const STATE_TIMEZONES: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Denver",
  IL: "America/Chicago",
  IN: "America/New_York",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/New_York",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
};

/** IANA zone for a US state code. Unknown/empty states fall back to UTC. */
export function timezoneForState(state: string): string {
  return STATE_TIMEZONES[state.trim().toUpperCase()] ?? "UTC";
}

/** YYYY-MM-DD parts of an instant in a zone, via Intl (no date lib). */
function partsInZone(at: Date, timeZone: string): {
  y: number;
  m: number;
  d: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's calendar date (YYYY-MM-DD) in the given zone. */
export function todayInZone(timeZone: string, at: Date = new Date()): string {
  const { y, m, d } = partsInZone(at, timeZone);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Add (or subtract) whole calendar days to a YYYY-MM-DD string. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** "2026-11-20" -> "Nov 20" (no year, per the pill spec). */
export function formatMonthDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
