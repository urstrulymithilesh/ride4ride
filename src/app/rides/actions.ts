"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { geocodeAddress, drivingDistanceMeters } from "@/lib/geocoding";
import { validateOffer, validateGet } from "@/lib/validations/rides";
import type { Timing } from "@/lib/validations/rides";
import type { FieldErrors } from "@/lib/validations/auth";

export interface RideFormState {
  error?: string;
  fieldErrors?: FieldErrors;
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
  timing: Timing,
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
  if (!user) redirect("/sign-in?redirectTo=/rides/offer");

  const result = validateOffer(formToRecord(formData));
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  const d = result.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_offer_ride", {
    p_from_city: d.from_city,
    p_from_state: d.from_state,
    p_from_zip: d.from_zip,
    p_to_city: d.to_city,
    p_to_state: d.to_state,
    p_to_zip: d.to_zip,
    p_description: d.description,
    p_ride_date: d.timing.ride_date,
    p_is_future: d.timing.is_future,
  });

  // Log before returning the friendly message. Without this the real cause
  // is invisible: a migration that never applied surfaced only as
  // "Couldn't create the post", with nothing in the server log to say why.
  if (error) {
    console.error("[rides] create_offer_ride failed:", error.message, error);
    return { error: "couldn't create the post. please try again." };
  }

  const ride = Array.isArray(data) ? data[0] : data;
  if (!ride?.id) {
    console.error("[rides] create_offer_ride returned no row:", data);
    return { error: "couldn't create the post. please try again." };
  }

  await saveTiming(supabase, ride.id, d.timing);

  revalidatePath("/rides");
  redirect(`/rides/${ride.id}`);
}

/**
 * One-click repost: flip an expired post back to active.
 *
 * Repost does NOT extend a post's life. Expiry is derived from the ride
 * date by `trg_set_ride_expiry` (migration 0008), so reactivating a post
 * whose ride date is already more than 7 days past will simply be
 * re-expired by the next cron pass. That is correct: reposting a ride
 * that has already happened should not resurrect it. To relist, the
 * owner changes the ride date, and the expiry follows it.
 *
 * We reset expiry_notified_at so the pre-expiry reminder can fire again
 * for the new window. RLS (owner-only update) is the access guard; the
 * trigger is what guarantees the expiry value.
 */
export async function repostRide(formData: FormData): Promise<void> {
  const user = await getUser();
  const rideId = String(formData.get("rideId") ?? "");
  if (!user) redirect(`/sign-in?redirectTo=/rides/${rideId}`);
  if (!rideId) redirect("/rides");

  const supabase = await createClient();
  const { error } = await supabase
    .from("rides")
    .update({
      status: "active",
      expiry_notified_at: null,
    })
    .eq("id", rideId)
    .eq("owner_id", user.id);

  if (error) redirect(`/rides/${rideId}?error=repost`);
  revalidatePath("/rides");
  redirect(`/rides/${rideId}`);
}

export async function createGetRide(
  _prev: RideFormState,
  formData: FormData,
): Promise<RideFormState> {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirectTo=/rides/get");

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
    return { error: "address lookup is unavailable right now. please try again." };
  }

  const fieldErrors: FieldErrors = {};
  if (!from) fieldErrors.from_address = "we couldn't find that pickup address.";
  if (!to) fieldErrors.to_address = "we couldn't find that drop-off address.";
  if (!from || !to) return { fieldErrors };

  const distance_meters = await drivingDistanceMeters(from, to);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_get_ride", {
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
    p_ride_date: d.timing.ride_date,
    p_is_future: d.timing.is_future,
  });

  // Log before returning the friendly message. Without this the real cause
  // is invisible: a migration that never applied surfaced only as
  // "Couldn't create the post", with nothing in the server log to say why.
  if (error) {
    console.error("[rides] create_get_ride failed:", error.message, error);
    return { error: "couldn't create the post. please try again." };
  }

  const ride = Array.isArray(data) ? data[0] : data;
  if (!ride?.id) {
    console.error("[rides] create_get_ride returned no row:", data);
    return { error: "couldn't create the post. please try again." };
  }

  await saveTiming(supabase, ride.id, d.timing);

  revalidatePath("/rides");
  redirect(`/rides/${ride.id}`);
}
