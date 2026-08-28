import type { FieldErrors } from "@/lib/validations/auth";

export type RideMode = "current" | "future";

const EXPIRE_DAY_CHOICES = [3, 7, 14, 30] as const;
export const DEFAULT_EXPIRE_DAYS = 7;

export interface Timing {
  is_future: boolean;
  ride_date: string | null; // YYYY-MM-DD
}

/** Parse the current/future toggle + optional date into DB-shaped timing. */
export function parseTiming(
  mode: string,
  date: string,
): { ok: true; data: Timing } | { ok: false; fieldErrors: FieldErrors } {
  const isFuture = mode === "future";
  const trimmed = date.trim();

  if (isFuture) {
    if (!trimmed)
      return { ok: false, fieldErrors: { ride_date: "Pick a date for the ride." } };
    const d = new Date(trimmed + "T00:00:00");
    if (Number.isNaN(d.getTime()))
      return { ok: false, fieldErrors: { ride_date: "That date isn't valid." } };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today)
      return { ok: false, fieldErrors: { ride_date: "Pick a date in the future." } };
    return { ok: true, data: { is_future: true, ride_date: trimmed } };
  }

  // Current ride: a date is optional (allowed since migration 0003).
  return { ok: true, data: { is_future: false, ride_date: trimmed || null } };
}

/** Compute a default expiry timestamp (ISO) from timing + an "expire in N days" choice. */
export function computeExpiresAt(timing: Timing, expireDaysRaw: string): string {
  if (timing.is_future && timing.ride_date) {
    // Future ride: expire the day after the ride date.
    const d = new Date(timing.ride_date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const days = EXPIRE_DAY_CHOICES.includes(Number(expireDaysRaw) as never)
    ? Number(expireDaysRaw)
    : DEFAULT_EXPIRE_DAYS;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export interface OfferInput {
  from_city: string;
  from_state: string;
  from_zip: string;
  to_city: string;
  to_state: string;
  to_zip: string;
  description: string;
  timing: Timing;
  expires_at: string;
}

export interface GetInput {
  from_address: string;
  to_address: string;
  description: string;
  timing: Timing;
  expires_at: string;
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
  return t.data;
}

export function validateOffer(
  raw: Record<string, string>,
): { ok: true; data: OfferInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const from_city = (raw.from_city ?? "").trim();
  const from_state = (raw.from_state ?? "").trim();
  const to_city = (raw.to_city ?? "").trim();
  const to_state = (raw.to_state ?? "").trim();

  if (!from_city) fieldErrors.from_city = "Enter the origin city.";
  if (!from_state) fieldErrors.from_state = "Enter the origin state.";
  if (!to_city) fieldErrors.to_city = "Enter the destination city.";
  if (!to_state) fieldErrors.to_state = "Enter the destination state.";

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
      expires_at: computeExpiresAt(timing, raw.expire_days ?? ""),
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
    fieldErrors.from_address = "Enter a full pickup address.";
  if (to_address.length < 5)
    fieldErrors.to_address = "Enter a full drop-off address.";

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
      expires_at: computeExpiresAt(timing, raw.expire_days ?? ""),
    },
  };
}
