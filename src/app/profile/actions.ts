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

/**
 * Update the caller's own profile. Only `display_name` and `username` are
 * writable — privileged columns (verification, school, is_admin, is_banned,
 * age/tos record) are locked down by GRANTs (migrations 0007, 0017), so a
 * client update cannot touch them even if attempted.
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

  const fieldErrors: FieldErrors = {};
  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) fieldErrors.displayName = displayNameError;
  const usernameError = validateUsername(username);
  if (usernameError) fieldErrors.username = usernameError;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();

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
    .update({ display_name: displayName, username })
    .eq("id", user.id);

  if (error) {
    if (/username|duplicate|already exists/i.test(error.message)) {
      return { fieldErrors: { username: "that username is taken." } };
    }
    return { error: "couldn't save your profile. please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { message: "profile saved." };
}
