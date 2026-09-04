import type { FieldErrors } from "@/lib/validations/auth";

/**
 * Validation for the "tell us the route you wanted" form.
 *
 * Deliberately permissive about the route itself: the whole point is to
 * capture routes the board cannot serve, including places we have no
 * inventory for and airports we have never heard of. Rejecting a route
 * for being unfamiliar would defeat the feature.
 */

export type RoleWanted = "get" | "give";

/** How far ahead a date window may reach. A year is generous and stops nonsense. */
const MAX_WINDOW_DAYS = 365;

export interface WantedRouteInput {
  from_city: string;
  from_state: string;
  from_airport: string | null;
  to_city: string;
  to_state: string;
  to_airport: string | null;
  date_window_start: string; // YYYY-MM-DD
  date_window_end: string; // YYYY-MM-DD
  role_wanted: RoleWanted;
}

const IATA_RE = /^[A-Za-z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Uppercase a 3-letter code, or null if blank. Invalid input returns undefined. */
function parseAirport(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  if (!IATA_RE.test(t)) return undefined;
  return t.toUpperCase();
}

function parseDate(raw: string): Date | null {
  const t = raw.trim();
  if (!DATE_RE.test(t)) return null;
  const d = new Date(t + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateWantedRoute(
  raw: Record<string, string>,
):
  | { ok: true; data: WantedRouteInput }
  | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};

  const from_city = (raw.from_city ?? "").trim();
  const from_state = (raw.from_state ?? "").trim();
  const to_city = (raw.to_city ?? "").trim();
  const to_state = (raw.to_state ?? "").trim();

  if (!from_city) fieldErrors.from_city = "Where were you starting from?";
  if (!from_state) fieldErrors.from_state = "Enter the state.";
  if (!to_city) fieldErrors.to_city = "Where were you going?";
  if (!to_state) fieldErrors.to_state = "Enter the state.";

  const from_airport = parseAirport(raw.from_airport ?? "");
  const to_airport = parseAirport(raw.to_airport ?? "");
  if (from_airport === undefined)
    fieldErrors.from_airport = "Use a 3-letter airport code, like ORD.";
  if (to_airport === undefined)
    fieldErrors.to_airport = "Use a 3-letter airport code, like ORD.";

  const start = parseDate(raw.date_window_start ?? "");
  const end = parseDate(raw.date_window_end ?? "");
  if (!start) fieldErrors.date_window_start = "Pick a start date.";
  if (!end) fieldErrors.date_window_end = "Pick an end date.";

  if (start && end) {
    if (end < start) {
      fieldErrors.date_window_end = "The end date is before the start date.";
    } else {
      const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
      if (spanDays > MAX_WINDOW_DAYS)
        fieldErrors.date_window_end = "Keep the window within a year.";
    }
  }

  const role_wanted: RoleWanted = raw.role_wanted === "give" ? "give" : "get";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      from_city,
      from_state,
      from_airport: from_airport as string | null,
      to_city,
      to_state,
      to_airport: to_airport as string | null,
      date_window_start: (raw.date_window_start ?? "").trim(),
      date_window_end: (raw.date_window_end ?? "").trim(),
      role_wanted,
    },
  };
}
