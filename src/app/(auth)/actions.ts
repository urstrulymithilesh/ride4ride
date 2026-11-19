"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOS_VERSION,
  validateSignUp,
  validateSignIn,
  sanitizeRedirect,
  type FieldErrors,
} from "@/lib/validations/auth";
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
    // An unchecked checkbox submits nothing at all, so absence is "no".
    ageConfirmed18: formData.get("ageConfirmed18") === "on",
    tosAccepted: formData.get("tosAccepted") === "on",
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors };

  const redirectTo = sanitizeRedirect(String(formData.get("redirectTo") ?? ""));
  const { phone, email, password, displayName, username, gender } = result.data;
  const supabase = await createClient();

  // Unique-handle pre-check for a friendly field error. The unique index
  // in 0017 is the real guarantee under concurrency; this just avoids
  // burning a signup attempt on an obviously-taken name.
  const { data: available } = await supabase.rpc("is_username_available", {
    p_username: username,
  });
  if (available === false) {
    return { fieldErrors: { username: "That username is taken." } };
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
    return { error: error.message };
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

  // Username has no direct Supabase credential: resolve it to the
  // account's phone (preferred) or email via the service role, then
  // sign in normally. Every failure collapses to the same generic
  // message so login never reveals whether a handle exists.
  let login: { phone: string } | { email: string } | null =
    result.data.kind === "phone" ? { phone: result.data.value } : null;
  if (!login) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("username", result.data.value)
        .maybeSingle();
      const { data: userData } = profile
        ? await admin.auth.admin.getUserById(profile.id)
        : { data: { user: null } };
      const user = userData.user;
      if (user?.phone) login = { phone: user.phone };
      else if (user?.email) login = { email: user.email };
    } catch {
      login = null;
    }
  }
  const { error } = login
    ? await supabase.auth.signInWithPassword({
        ...login,
        password: result.data.password,
      })
    : { error: new Error("invalid credentials") };
  if (error) {
    // Keep the message generic to avoid leaking which part was wrong.
    return { error: "Invalid username, phone number, or password." };
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
