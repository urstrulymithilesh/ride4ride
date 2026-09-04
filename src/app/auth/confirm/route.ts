import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirect } from "@/lib/validations/auth";
import { claimWantedRoutes } from "@/lib/wanted-routes";

/**
 * Handles the email-confirmation link Supabase sends on sign-up (and for
 * magic-link / recovery flows later). Verifies the OTP, which sets the auth
 * cookies via the server client, then redirects into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeRedirect(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { data: verified, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Email is now confirmed — upgrade to "verified student" if the domain
      // is allowed. The RPC re-checks confirmation + domain server-side, so
      // this can't be abused to self-verify. Failure here is non-fatal.
      await supabase.rpc("verify_current_user_email");

      // Attach any wanted-route rows this person submitted before signing
      // up. This is the far side of the email round trip that made a
      // client-side hand-off impossible. Best-effort by design: a missing
      // cookie just leaves the row unowned, and it still counts.
      if (verified.user) await claimWantedRoutes(verified.user.id);

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/sign-in?error=confirmation_failed", request.url),
  );
}
