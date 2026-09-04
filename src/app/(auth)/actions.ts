"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  TOS_VERSION,
  validateSignUp,
  validateSignIn,
  sanitizeRedirect,
  type FieldErrors,
} from "@/lib/validations/auth";
import { getVerificationMode, STUDENT_DOMAIN_HINT } from "@/lib/verification";
import { claimWantedRoutes } from "@/lib/wanted-routes";

export interface AuthState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Set when sign-up succeeds but email confirmation is required. */
  message?: string;
}

async function siteOrigin(): Promise<string> {
  // Prefer the configured canonical URL; fall back to the request origin.
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = validateSignUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    // An unchecked checkbox submits nothing at all, so absence is "no".
    ageConfirmed18: formData.get("ageConfirmed18") === "on",
    tosAccepted: formData.get("tosAccepted") === "on",
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  const redirectTo = sanitizeRedirect(String(formData.get("redirectTo") ?? ""));
  const { email, password, displayName } = result.data;
  const supabase = await createClient();

  // In "restrict" mode, only allowed student domains may create an account.
  // The allowed-domain list lives in the DB (allowed_email_domains) so it's
  // the single source of truth for both this check and DB-side verification.
  if (getVerificationMode() === "restrict") {
    const { data: allowed } = await supabase.rpc("is_allowed_student_email", {
      p_email: email,
    });
    if (!allowed) {
      return {
        fieldErrors: {
          email: `Sign-up is limited to student email addresses (${STUDENT_DOMAIN_HINT}).`,
        },
      };
    }
  }

  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Carried into profiles by handle_new_user() in the same transaction
      // as account creation (migration 0009), so an account cannot exist
      // without its acceptance record.
      data: {
        display_name: displayName,
        age_confirmed_18: true,
        tos_version: TOS_VERSION,
      },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) return { error: error.message };

  // If email confirmation is disabled, a session exists immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(redirectTo);
  }

  // Otherwise prompt the user to confirm via email.
  return {
    message:
      "Check your email to confirm your account, then sign in to continue.",
  };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = validateSignIn({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  const redirectTo = sanitizeRedirect(String(formData.get("redirectTo") ?? ""));
  const supabase = await createClient();

  const { data: signedIn, error } = await supabase.auth.signInWithPassword(
    result.data,
  );
  if (error) {
    // Keep the message generic to avoid leaking which part was wrong.
    return { error: "Invalid email or password." };
  }

  // Also claim here, not only on email confirmation: someone may submit a
  // wanted route, close the tab, and sign in days later with the cookie
  // still present. Best-effort and never blocks sign-in.
  if (signedIn.user) await claimWantedRoutes(signedIn.user.id);

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
