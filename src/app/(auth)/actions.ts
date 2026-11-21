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
import { buildFunUsername } from "@/lib/usernames";
import { getVerificationMode, allowedDomainsHint } from "@/lib/verification";

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
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    username: String(formData.get("username") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    dob: String(formData.get("dob") ?? ""),
    // An unchecked checkbox submits nothing at all, so absence is "no".
    ageConfirmed18: formData.get("ageConfirmed18") === "on",
    tosAccepted: formData.get("tosAccepted") === "on",
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  const redirectTo = sanitizeRedirect(String(formData.get("redirectTo") ?? ""));
  const { phone, email, password, displayName, gender, dob } = result.data;
  let username = result.data.username;
  const supabase = await createClient();

  // Website-assigned handles: mint a fun letters-only name when the form
  // didn't supply one. Loop the availability RPC; the unique index is the
  // final arbiter under concurrency.
  if (!username) {
    for (let i = 0; i < 20; i++) {
      const candidate = buildFunUsername();
      const { data: free } = await supabase.rpc("is_username_available", {
        p_username: candidate,
      });
      if (free === true) {
        username = candidate;
        break;
      }
    }
    if (!username) {
      return { error: "Couldn't pick a username. Please try again." };
    }
  } else {
    // Legacy explicit handle: friendly pre-check for a taken name.
    const { data: available } = await supabase.rpc("is_username_available", {
      p_username: username,
    });
    if (available === false) {
      return { fieldErrors: { username: "That username is taken." } };
    }
  }

  // Email is optional at sign-up, but when given it must be allow-listed.
  // In "restrict" mode, only allow-listed email domains may be attached.
  // The list lives in the DB (allowed_email_domains) so it can be
  // changed without a redeploy. Since 0013 that table is a SIGNUP
  // ALLOWLIST ONLY — it no longer grants any badge.
  if (email && getVerificationMode() === "restrict") {
    const { data: allowed } = await supabase.rpc("is_allowed_student_email", {
      p_email: email,
    });
    if (!allowed) {
      return {
        fieldErrors: {
          email: `Sign up with ${await allowedDomainsHint(supabase)}.`,
        },
      };
    }
  }

  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    phone,
    ...(email ? { email } : {}),
    password,
    options: {
      // Carried into profiles by handle_new_user() in the same transaction
      // as account creation (migration 0009), so an account cannot exist
      // without its acceptance record.
      data: {
        display_name: displayName,
        username,
        gender,
        date_of_birth: dob,
        age_confirmed_18: true,
        tos_version: TOS_VERSION,
      },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) {
    // Concurrent signup with the same handle hits the 0017 unique index.
    // Map it to the field so the user can pick another name.
    if (/username|duplicate|already exists/i.test(error.message)) {
      return { fieldErrors: { username: "That username is taken." } };
    }
    // A taken phone number (or email) must not say which one exists.
    if (/already registered|already exists|duplicate|taken|in use/i.test(error.message)) {
      return { error: "An account with those details already exists." };
    }
    // Flapping Auth (e.g. a 500 with an empty message) must never render
    // as raw "{}" — fall back to something a human can act on.
    const raw = error.message?.trim();
    return {
      error:
        raw && raw !== "{}"
          ? raw
          : "Couldn't create your account. Please try again.",
    };
  }

  // If confirmation is disabled, a session exists immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(redirectTo);
  }

  // Otherwise prompt the user to confirm (email link or SMS code,
  // depending on what they signed up with).
  return {
    message: email
      ? "Check your email to confirm your account, then sign in to continue."
      : "Check your texts for a confirmation code, then sign in to continue.",
  };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = validateSignIn({
    identifier: String(
      formData.get("identifier") ?? formData.get("phone") ?? "",
    ),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  const redirectTo = sanitizeRedirect(String(formData.get("redirectTo") ?? ""));
  const supabase = await createClient();

  // Phone + password only, for now: the credential goes straight to
  // Supabase, no username resolution. Every failure collapses to the same
  // generic message to avoid leaking which part was wrong.
  const { error } = await supabase.auth.signInWithPassword({
    phone: result.data.phone,
    password: result.data.password,
  });
  if (error) {
    return { error: "Invalid phone number or password." };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
