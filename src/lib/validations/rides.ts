import type { FieldErrors } from "@/lib/validations/auth";

export type RideMode = "current" | "future";
export type TimeMode = "asap" | "anytime" | "at";

export interface Timing {
  is_future: boolean;
  ride_date: string | null; // YYYY-MM-DD
  time_mode: TimeMode;
  ride_time: string | null; // 'HH:MM' 24h, only when time_mode is 'at'
}

/** Parse the asap/anytime/specific-time radios into DB-shaped timing. */
export function parseRideTiming(
  timing: string,
  time: string,
): { ok: true; data: Pick<Timing, "time_mode" | "ride_time"> } | { ok: false; fieldErrors: FieldErrors } {
  const t = timing.trim() || "asap";
  if (t === "anytime") return { ok: true, data: { time_mode: "anytime", ride_time: null } };
  if (t === "at") {
    const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time.trim());
    if (!m)
      return { ok: false, fieldErrors: { ride_time: "pick a time for the ride." } };
    return { ok: true, data: { time_mode: "at", ride_time: `${m[1]}:${m[2]}` } };
  }
  return { ok: true, data: { time_mode: "asap", ride_time: null } };
}

/** Parse the current/future toggle + optional date (time handled separately). */
export function parseTiming(
  mode: string,
  date: string,
): { ok: true; data: Pick<Timing, "is_future" | "ride_date"> } | { ok: false; fieldErrors: FieldErrors } {
  const isFuture = mode === "future";
  const trimmed = date.trim();

  if (isFuture) {
    if (!trimmed)
      return { ok: false, fieldErrors: { ride_date: "pick a date for the ride." } };
    const d = new Date(trimmed + "T00:00:00");
    if (Number.isNaN(d.getTime()))
      return { ok: false, fieldErrors: { ride_date: "that date isn't valid." } };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today)
      return { ok: false, fieldErrors: { ride_date: "pick a date in the future." } };
    return { ok: true, data: { is_future: true, ride_date: trimmed } };
  }

  // Current ride: a date is optional (allowed since migration 0003).
  return { ok: true, data: { is_future: false, ride_date: trimmed || null } };
}

// Expiry is NOT computed here, and is not part of any form input.
//
// A post expires exactly 7 days after the ride's scheduled date passes
// (or 7 days after creation when there is no date). That rule lives in
// one place only: the `trg_set_ride_expiry` trigger added by migration
// 0008, which derives `expires_at` on every insert and update and
// discards anything a caller supplies. Computing it here as well would
// be a second source of truth that silently drifts.

export interface OfferInput {
  from_city: string;
  from_state: string;
  from_zip: string;
  to_city: string;
  to_state: string;
  to_zip: string;
  description: string;
  timing: Timing;
}

export interface GetInput {
  from_address: string;
  to_address: string;
  description: string;
  timing: Timing;
}

function commonTiming(
  raw: Record<string, string>,
  fieldErrors: FieldErrors,
): Timing | null {
  const t = parseTiming(raw.mode ?? "current", raw.ride_date ?? "");
  if (!t.ok) {
    Object.assign(fieldErrors, t.fieldErrors);
    return null;
  }
  const rt = parseRideTiming(raw.timing ?? "asap", raw.ride_time ?? "");
  if (!rt.ok) {
    Object.assign(fieldErrors, rt.fieldErrors);
    return null;
  }
  return { ...t.data, ...rt.data };
}

export function validateOffer(
  raw: Record<string, string>,
): { ok: true; data: OfferInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const from_city = (raw.from_city ?? "").trim();
  const from_state = (raw.from_state ?? "").trim();
  const to_city = (raw.to_city ?? "").trim();
  const to_state = (raw.to_state ?? "").trim();

  if (!from_city) fieldErrors.from_city = "enter the origin city.";
  if (!from_state) fieldErrors.from_state = "enter the origin state.";
  if (!to_city) fieldErrors.to_city = "enter the destination city.";
  if (!to_state) fieldErrors.to_state = "enter the destination state.";

  const timing = commonTiming(raw, fieldErrors);
  if (Object.keys(fieldErrors).length > 0 || !timing)
    return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      from_city,
      from_state,
      from_zip: (raw.from_zip ?? "").trim(),
      to_city,
      to_state,
      to_zip: (raw.to_zip ?? "").trim(),
      description: (raw.description ?? "").trim(),
      timing,
    },
  };
}

export function validateGet(
  raw: Record<string, string>,
): { ok: true; data: GetInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const from_address = (raw.from_address ?? "").trim();
  const to_address = (raw.to_address ?? "").trim();

  if (from_address.length < 5)
    fieldErrors.from_address = "enter a full pickup address.";
  if (to_address.length < 5)
    fieldErrors.to_address = "enter a full drop-off address.";

  const timing = commonTiming(raw, fieldErrors);
  if (Object.keys(fieldErrors).length > 0 || !timing)
    return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      from_address,
      to_address,
      description: (raw.description ?? "").trim(),
      timing,
    },
  };
}
