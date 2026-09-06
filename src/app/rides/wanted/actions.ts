"use server";

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { rememberWantedRoute } from "@/lib/wanted-routes";
import { takeRateLimit } from "@/lib/rate-limit";
import {
  validateWantedRoute,
  type WantedRouteInput,
} from "@/lib/validations/wanted-routes";
import type { FieldErrors } from "@/lib/validations/auth";

export interface WantedRouteState {
  fieldErrors?: FieldErrors;
  error?: string;
  message?: string;
}

/**
 * Record a route someone looked for and did not find.
 *
 * Works signed out on purpose. Most people arrive by tapping a link in a
 * group chat with no account, and they are exactly the people whose
 * unserved demand we most need to see. The row is written immediately;
 * `lib/wanted-routes` drops a cookie so it can be attached to an account
 * later if they sign up.
 */
export async function submitWantedRoute(
  _prev: WantedRouteState,
  formData: FormData,
): Promise<WantedRouteState> {
  const raw = Object.fromEntries(
    [
      "from_city",
      "from_state",
      "from_airport",
      "to_city",
      "to_state",
      "to_airport",
      "date_window_start",
      "date_window_end",
      "role_wanted",
    ].map((k) => [k, String(formData.get(k) ?? "")]),
  );

  const result = validateWantedRoute(raw);
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  // Rate limit AFTER validation so a malformed submission does not burn a
  // token, and BEFORE the insert so a flood never reaches the table. This
  // is the only write endpoint that works without an account, so it is the
  // one that needs this.
  if (!(await takeRateLimit("wanted_routes"))) {
    return {
      error:
        "You've sent a few of these already. Please try again in a little while.",
    };
  }

  const user = await getUser();
  const supabase = await createClient();

  // The id is generated HERE rather than read back from the insert.
  //
  // The obvious `.insert(row).select("id")` cannot work for an anonymous
  // row, and the failure is not obvious from the error. Asking for the
  // representation makes PostgREST run INSERT ... RETURNING, and RETURNING
  // is evaluated against the SELECT policy — which is
  // `created_by = auth.uid()`. An unowned row is therefore invisible the
  // moment it is created, the RETURNING is refused, and Postgres reports
  // it as "new row violates row-level security policy", pointing at the
  // INSERT check that was actually fine.
  //
  // Verified against the live API: identical anonymous insert returns 401
  // with `Prefer: return=representation` and 201 with `return=minimal`.
  //
  // Generating the id up front sidesteps it entirely: nothing needs to be
  // read back, and we still have the id for the claim cookie.
  const id = randomUUID();
  const row: WantedRouteInput & { id: string; created_by: string | null } = {
    id,
    ...result.data,
    created_by: user?.id ?? null,
  };

  const { error } = await supabase.from("wanted_routes").insert(row);

  if (error) {
    console.error("[wanted-routes] insert failed:", error.message, error);
    return { error: "Couldn't save that route. Please try again." };
  }

  // Only anonymous rows need remembering; a signed-in row already has an
  // owner and there is nothing to claim later.
  if (!user) await rememberWantedRoute(id);

  return {
    message:
      "Thanks — noted. We'll use this to work out which routes to open next.",
  };
}
