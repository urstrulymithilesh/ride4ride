import type { FieldErrors } from "@/lib/validations/auth";
import {
  addDays,
  todayInZone,
  timezoneForState,
} from "@/lib/pickup-tz";

export type DateOption = "today" | "tomorrow" | "custom";
export type TimeMode = "asap" | "anytime" | "at";

export interface Timing {
  ride_date: string; // YYYY-MM-DD, always explicit
  time_mode: TimeMode;
  ride_time: string | null; // 'HH:MM' 24h, only when time_mode is 'at'
}

/** The pre-resolution shape: date option + raw custom date + clock time. */
export interface TimingDraft {
  time_mode: TimeMode;
  ride_time: string | null;
  date_option: DateOption;
  custom_date: string;
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

/** Parse the date option + custom date SHAPE (no timezone math — the
 *  pickup state needed for that arrives later via geocoding). */
export function parseDateFields(
  dateOption: string,
  customDate: string,
): { ok: true; data: Pick<TimingDraft, "date_option" | "custom_date"> } | { ok: false; fieldErrors: FieldErrors } {
  const opt = (dateOption || "today").trim();
  if (opt !== "today" && opt !== "tomorrow" && opt !== "custom") {
    return {
      ok: false,
      fieldErrors: { ride_date: "pick today, tomorrow, or a date." },
    };
  }
  const custom = customDate.trim();
  if (opt === "custom") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(custom)) {
      return {
        ok: false,
        fieldErrors: { ride_date: "pick a valid date." },
      };
    }
    const [y, m, d] = custom.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      return {
        ok: false,
        fieldErrors: { ride_date: "pick a valid date." },
      };
    }
  }
  return {
    ok: true,
    data: { date_option: opt as DateOption, custom_date: custom },
  };
}

/**
 * Resolve the posting date against the pickup's local day. Runs AFTER
 * geocoding (need-ride) or directly (give-ride, which carries from_state).
 * Rules: today/tomorrow resolve in the pickup zone; a custom date must be
 * past tomorrow (presets cover the rest); "now" only exists for today.
 */
export function resolvePostDate(
  draft: Pick<TimingDraft, "date_option" | "custom_date" | "time_mode">,
  fromState: string,
  now: Date = new Date(),
): { ok: true; data: { ride_date: string } } | { ok: false; fieldErrors: FieldErrors } {
  const tz = timezoneForState(fromState);
  const today = todayInZone(tz, now);
  const tomorrow = addDays(today, 1);
  let rideDate: string;
  if (draft.date_option === "today") rideDate = today;
  else if (draft.date_option === "tomorrow") rideDate = tomorrow;
  else {
    rideDate = draft.custom_date;
    if (rideDate <= tomorrow) {
      return {
        ok: false,
        fieldErrors: { ride_date: "pick a date after tomorrow." },
      };
    }
  }
  if (draft.time_mode === "asap" && rideDate !== today) {
    return {
      ok: false,
      fieldErrors: { timing: "now is only for today's rides." },
    };
  }
  return { ok: true, data: { ride_date: rideDate } };
}

// Expiry is NOT computed here, and is not part of any form input.
//
// A post's life follows its timing (migration 0024): asap +1h, anytime to
// end of posting day, set time +1h. That rule lives in one place only:
// the `trg_set_ride_expiry` trigger, which derives `expires_at` on every
// insert and update and discards anything a caller supplies. Computing it
// here as well would be a second source of truth that silently drifts.

export interface OfferInput {
  from_city: string;
  from_state: string;
  from_zip: string;
  to_city: string;
  to_state: string;
  to_zip: string;
  description: string;
  timing: TimingDraft;
  /** Captain's explicit airport tag (IATA, uppercase) or null. */
  from_airport: string | null;
}

export interface GetInput {
  from_address: string;
  to_address: string;
  description: string;
  timing: TimingDraft;
}

function commonTiming(
  raw: Record<string, string>,
  fieldErrors: FieldErrors,
): TimingDraft | null {
  const d = parseDateFields(raw.date_option ?? "today", raw.custom_date ?? "");
  if (!d.ok) {
    Object.assign(fieldErrors, d.fieldErrors);
    return null;
  }
  const rt = parseRideTiming(raw.timing ?? "asap", raw.ride_time ?? "");
  if (!rt.ok) {
    Object.assign(fieldErrors, rt.fieldErrors);
    return null;
  }
  return { ...d.data, ...rt.data };
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

  // Optional captain airport tag. Validated here (friendlier error) AND
  // by the DB check constraint; normalized to uppercase for the RPC.
  const airportRaw = (raw.from_airport ?? "").trim().toUpperCase();
  if (airportRaw && !/^[A-Z]{3}$/.test(airportRaw)) {
    fieldErrors.from_airport = "use a 3-letter airport code, like ord.";
  }

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
      from_airport: airportRaw || null,
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
