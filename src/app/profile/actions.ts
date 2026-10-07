"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import {
  validateUsername,
  type FieldErrors,
} from "@/lib/validations/auth";

export interface ProfileState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Set on success so the form can confirm the save. */
  message?: string;
}

function validateDisplayName(displayName: string): string | null {
  if (displayName.length < 2)
    return "display name must be at least 2 characters.";
  if (displayName.length > 50)
    return "display name must be 50 characters or fewer.";
  return null;
}

function validateDob(dob: string): string | null {
  if (!dob) return "enter your date of birth.";
  const d = new Date(dob + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "that date isn't valid.";
  const now = new Date();
  if (d > now) return "date of birth can't be in the future.";
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 18) return "you must be 18 or older.";
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  if (!/^[+()\-.\s\d]{7,20}$/.test(phone))
    return "enter a valid phone number.";
  return null;
}

function validateEmailAddress(email: string): string | null {
  if (!email) return "enter your email address.";
  if (!/^\S+@\S+\.\S+$/.test(email))
    return "enter a valid email address.";
  return null;
}

/**
 * Update the caller's own profile. Writable: display_name, username,
 * date_of_birth, phone (grants in 0017 + 0020); email goes through the
 * auth API (confirmation sent to the new address). Everything else stays
 * locked down, so a client update cannot touch it even if attempted.
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getUser();
  if (!user) return { error: "you must be signed in to edit your profile." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const dob = String(formData.get("dob") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const fieldErrors: FieldErrors = {};
  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) fieldErrors.displayName = displayNameError;
  const usernameError = validateUsername(username);
  if (usernameError) fieldErrors.username = usernameError;
  const dobError = validateDob(dob);
  if (dobError) fieldErrors.dob = dobError;
  const phoneError = validatePhone(phone);
  if (phoneError) fieldErrors.phone = phoneError;
  const emailError = validateEmailAddress(email);
  if (emailError) fieldErrors.email = emailError;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();

  // Email change goes through auth (confirmation lands in the new inbox).
  // Do it first: nothing persistent changes until the link is clicked.
  if (email && email !== (user.email ?? "").toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email });
    if (emailError) {
      return { fieldErrors: { email: "couldn't change email. please try again." } };
    }
  }

  // Friendly pre-check for a taken handle. The unique index in 0017 is the
  // real guarantee under concurrency; this just avoids a raw DB error for
  // the common case. Skip the check when the name is unchanged.
  const { data: current } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle<{ username: string }>();
  if (current && current.username.toLowerCase() !== username) {
    const { data: available } = await supabase.rpc("is_username_available", {
      p_username: username,
    });
    if (available === false) {
      return { fieldErrors: { username: "that username is taken." } };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
      date_of_birth: dob,
      phone: phone || null,
    })
    .eq("id", user.id);

  if (error) {
    if (/username|duplicate|already exists/i.test(error.message)) {
      return { fieldErrors: { username: "that username is taken." } };
    }
    if (/date_of_birth|phone[^s]|column/i.test(error.message)) {
      // Migration 0020 hasn't applied: the new columns don't exist yet,
      // so the whole update fails and nothing is saved.
      return {
        error:
          "couldn't save — new profile fields aren't ready yet (database update pending). please try again later.",
      };
    }
    return { error: "couldn't save your profile. please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return {
    message:
      email && email !== (user.email ?? "").toLowerCase()
        ? "profile saved. confirmation sent to the new email."
        : "profile saved.",
  };
}

/**
 * Change the caller's password. The live session is the identity proof;
 * Supabase handles hashing. Minimum length matches sign-up.
 */
export async function changePassword(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getUser();
  if (!user) return { error: "you must be signed in to change your password." };

  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: FieldErrors = {};
  if (next.length < 8)
    fieldErrors.newPassword = "password must be at least 8 characters.";
  else if (next !== confirm)
    fieldErrors.confirmPassword = "passwords don't match.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return { error: "couldn't change password. please try again." };
  }
  return { message: "password changed." };
}
