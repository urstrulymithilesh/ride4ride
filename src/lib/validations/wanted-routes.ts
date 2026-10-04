import type { FieldErrors } from "@/lib/validations/auth";

/**
 * Validation for the "tell us the route you wanted" form.
 *
 * Deliberately permissive about the route itself: the whole point is to
 * capture routes the board cannot serve. Rejecting a route for being
 * unfamiliar would defeat the feature.
 */

export type RoleWanted = "get" | "give";

/** How far ahead a date window may reach. A year is generous and stops nonsense. */
const MAX_WINDOW_DAYS = 365;

export interface WantedRouteInput {
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  date_window_start: string; // YYYY-MM-DD
  date_window_end: string; // YYYY-MM-DD
  role_wanted: RoleWanted;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  if (!from_city) fieldErrors.from_city = "where were you starting from?";
  if (!from_state) fieldErrors.from_state = "enter the state.";
  if (!to_city) fieldErrors.to_city = "where were you going?";
  if (!to_state) fieldErrors.to_state = "enter the state.";

  const start = parseDate(raw.date_window_start ?? "");
  const end = parseDate(raw.date_window_end ?? "");
  if (!start) fieldErrors.date_window_start = "pick a start date.";
  if (!end) fieldErrors.date_window_end = "pick an end date.";

  if (start && end) {
    if (end < start) {
      fieldErrors.date_window_end = "the end date is before the start date.";
    } else {
      const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
      if (spanDays > MAX_WINDOW_DAYS)
        fieldErrors.date_window_end = "keep the window within a year.";
    }
  }

  const role_wanted: RoleWanted = raw.role_wanted === "give" ? "give" : "get";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      from_city,
      from_state,
      to_city,
      to_state,
      date_window_start: (raw.date_window_start ?? "").trim(),
      date_window_end: (raw.date_window_end ?? "").trim(),
      role_wanted,
    },
  };
}
