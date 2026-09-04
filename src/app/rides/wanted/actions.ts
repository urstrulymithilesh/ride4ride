"use server";

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
  const row: WantedRouteInput & { created_by: string | null } = {
    ...result.data,
    // Signed out => null, which is the only shape the anon INSERT policy
    // accepts. Signed in => own id, the only other shape it accepts.
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("wanted_routes")
    .insert(row)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[wanted-routes] insert failed:", error.message, error);
    return { error: "Couldn't save that route. Please try again." };
  }

  // Only anonymous rows need remembering; a signed-in row already has an
  // owner and there is nothing to claim later.
  if (!user && data?.id) await rememberWantedRoute(data.id);

  return {
    message:
      "Thanks — noted. We'll use this to work out which routes to open next.",
  };
}
