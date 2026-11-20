"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { geocodeAddress, drivingDistanceMeters } from "@/lib/geocoding";
import { nearPickup } from "@/lib/geo";
import { validateOffer, validateGet, resolvePostDate } from "@/lib/validations/rides";
import type { TimingDraft } from "@/lib/validations/rides";
import type { FieldErrors } from "@/lib/validations/auth";

export interface RideFormState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Set on a successful post so the client can clear its draft and go
   *  to the new post itself (replacing the old server redirect). */
  ok?: true;
  rideId?: string;
}

/**
 * Timing rides on the post right after the create RPC returns its id.
 * Kept out of the RPCs on purpose: their signatures are covered by SQL
 * proofs, and owner-only UPDATE is already the RLS rule. The column
 * DEFAULT ('asap') keeps the row valid even if this write ever fails,
 * so a failure logs and moves on instead of failing the whole post.
 */
async function saveTiming(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideId: string,
  timing: TimingDraft,
): Promise<void> {
  const { error } = await supabase
    .from("rides")
    .update({ time_mode: timing.time_mode, ride_time: timing.ride_time })
    .eq("id", rideId);
  if (error) console.error("[rides] timing update failed:", error.message, error);
}

function formToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function createOfferRide(
  _prev: RideFormState,
  formData: FormData,
): Promise<RideFormState> {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/");

  const result = validateOffer(formToRecord(formData));
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  const d = result.data;

  // The posting date resolves against the pickup's local day (known
  // upfront for give-rides: the city comes straight from the form).
  const resolved = resolvePostDate(
    d.timing,
    d.from_state,
  );
  if (!resolved.ok) return { fieldErrors: resolved.fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_offer_ride", {
    p_from_city: d.from_city,
    p_from_state: d.from_state,
    p_from_zip: d.from_zip,
    p_to_city: d.to_city,
    p_to_state: d.to_state,
    p_to_zip: d.to_zip,
    p_description: d.description,
    p_ride_date: resolved.data.ride_date,
    p_from_airport: d.from_airport ?? "",
  });

  // Log before returning the friendly message. Without this the real cause
  // is invisible: a migration that never applied surfaced only as
  // "Couldn't create the post", with nothing in the server log to say why.
  if (error) {
    console.error("[rides] create_offer_ride failed:", error.message, error);
    return { error: `Couldn't create the post. Please try again. (${error.message.slice(0, 160)})` };
  }

  const ride = Array.isArray(data) ? data[0] : data;
  if (!ride?.id) {
    console.error("[rides] create_offer_ride returned no row:", data);
    return { error: "Couldn't create the post. Please try again. (empty response)" };
  }

  await saveTiming(supabase, ride.id, d.timing);

  revalidatePath("/rides");
  revalidatePath("/");
  return { ok: true as const, rideId: ride.id };
}

export async function createGetRide(
  _prev: RideFormState,
  formData: FormData,
): Promise<RideFormState> {  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/");

  const result = validateGet(formToRecord(formData));
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  const d = result.data;

  // Geocode BOTH addresses server-side (Mapbox token never hits the browser).
  let from, to;
  try {
    [from, to] = await Promise.all([
      geocodeAddress(d.from_address),
      geocodeAddress(d.to_address),
    ]);
  } catch {
    return { error: "Address lookup is unavailable right now. Please try again." };
  }

  const fieldErrors: FieldErrors = {};
  if (!from) fieldErrors.from_address = "We couldn't find that pickup address.";
  if (!to) fieldErrors.to_address = "We couldn't find that drop-off address.";
  if (!from || !to) return { fieldErrors };

  const distance_meters = await drivingDistanceMeters(from, to);

  // The posting date resolves against the pickup's local day, known only
  // after geocoding here.
  const resolved = resolvePostDate(
    d.timing,
    from.state ?? "",
  );
  if (!resolved.ok) return { fieldErrors: resolved.fieldErrors };

  // Public map pin: near the pickup, never on it. The exact point stays
  // in row-protected ride_locations; only this pre-jittered pin is
  // world-readable (plus the zoom cap, houses stay unidentifiable).
  const pin = nearPickup(from, `${d.from_address}|${d.to_address}`);

  const supabase = await createClient();
  const baseParams = {
    // Coarse fields derived from geocoding (safe to show publicly).
    p_from_city: from.city ?? "unknown",
    p_from_state: from.state ?? "",
    p_from_zip: from.zip ?? "",
    p_to_city: to.city ?? "unknown",
    p_to_state: to.state ?? "",
    p_to_zip: to.zip ?? "",
    // Sensitive fields -> row-protected ride_locations.
    p_from_address: d.from_address,
    p_to_address: d.to_address,
    p_from_lat: from.lat,
    p_from_lng: from.lng,
    p_to_lat: to.lat,
    p_to_lng: to.lng,
    p_distance_meters: distance_meters,
    // Masked street names (public by design, never house numbers — see
    // maskedStreet() in lib/geocoding.ts). Empty string => stored as NULL
    // by the RPC's nullif().
    p_from_street: from.street ?? "",
    p_to_street: to.street ?? "",
    p_description: d.description,
    p_ride_date: resolved.data.ride_date,
  };
  let { data, error } = await supabase.rpc("create_get_ride", {
    ...baseParams,
    p_pin_lat: pin.lat,
    p_pin_lng: pin.lng,
  });

  // Pre-0022 databases only have the 18-arg RPC: retry without the pin
  // (the feed falls back to the city-center pin) instead of failing the
  // post. Any other error is real and handled below.
  if (error && /could not find the function/i.test(error.message)) {
    ({ data, error } = await supabase.rpc("create_get_ride", baseParams));
  }

  // Log before returning the friendly message. Without this the real cause
  // is invisible: a migration that never applied surfaced only as
  // "Couldn't create the post", with nothing in the server log to say why.
  if (error) {
    console.error("[rides] create_get_ride failed:", error.message, error);
    return { error: `Couldn't create the post. Please try again. (${error.message.slice(0, 160)})` };
  }

  const ride = Array.isArray(data) ? data[0] : data;
  if (!ride?.id) {
    console.error("[rides] create_get_ride returned no row:", data);
    return { error: "Couldn't create the post. Please try again. (empty response)" };
  }

  await saveTiming(supabase, ride.id, d.timing);

  revalidatePath("/rides");
  revalidatePath("/");
  return { ok: true as const, rideId: ride.id };
}

/**
 * Quick-post popup submit. Same address fields for both modes; give-rides
 * posts derive city/state/zip by geocoding server-side, then delegate to
 * the regular create actions (which validate, write, and time-stamp).
 * Returns the new post id on success so the client can clear its draft
 * and navigate itself; sign-in bounces still redirect server-side.
 */
export async function submitQuickPost(
  _prev: RideFormState,
  formData: FormData,
): Promise<RideFormState> {
  const postMode = String(formData.get("postMode") ?? "need");
  if (postMode !== "give") {
    return await createGetRide(_prev, formData);
  }

  const fromAddress = String(formData.get("from_address") ?? "").trim();
  const toAddress = String(formData.get("to_address") ?? "").trim();
  if (fromAddress.length < 5)
    return { fieldErrors: { from_address: "Enter a full pickup address." } };
  if (toAddress.length < 5)
    return { fieldErrors: { to_address: "Enter a full drop-off address." } };

  let from, to;
  try {
    [from, to] = await Promise.all([
      geocodeAddress(fromAddress),
      geocodeAddress(toAddress),
    ]);
  } catch {
    return { error: "Address lookup is unavailable right now. Please try again." };
  }
  if (!from || !to) {
    return {
      fieldErrors: {
        ...(!from ? { from_address: "We couldn't find that pickup address." } : {}),
        ...(!to ? { to_address: "We couldn't find that drop-off address." } : {}),
      },
    };
  }

  const fd = new FormData();
  fd.set("from_city", from.city ?? "");
  fd.set("from_state", from.state ?? "");
  fd.set("from_zip", from.zip ?? "");
  fd.set("to_city", to.city ?? "");
  fd.set("to_state", to.state ?? "");
  fd.set("to_zip", to.zip ?? "");
  fd.set("description", String(formData.get("description") ?? ""));
  fd.set("date_option", String(formData.get("date_option") ?? "today"));
  fd.set("custom_date", String(formData.get("custom_date") ?? ""));
  fd.set("timing", String(formData.get("timing") ?? "asap"));
  fd.set("ride_time", String(formData.get("ride_time") ?? ""));
  return await createOfferRide(_prev, fd);
}
