"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import {
  validateDateOfBirth,
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
    return "Display name must be at least 2 characters.";
  if (displayName.length > 50)
    return "Display name must be 50 characters or fewer.";
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  if (!/^[+()\-.\s\d]{7,20}$/.test(phone))
    return "Enter a valid phone number.";
  return null;
}

function validateEmailAddress(email: string): string | null {
  // Empty is allowed: phone-only accounts have no email, and nobody is
  // forced to add one to save their profile. Once an email IS attached,
  // Supabase Auth offers no supported way to detach it, so updateProfile
  // below rejects clearing an existing address instead of pretending.
  if (!email) return null;
  if (!/^\S+@\S+\.\S+$/.test(email))
    return "Enter a valid email address.";
  return null;
}

/**
 * Update the caller's own profile. Writable: display_name,
 * date_of_birth, phone (grants in 0017 + 0020). Everything else stays
 * locked down, so a client update cannot touch it even if attempted.
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in to edit your profile." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const dob = String(formData.get("dob") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const fieldErrors: FieldErrors = {};
  const supabase = await createClient();
  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) fieldErrors.displayName = displayNameError;
  const dobError = validateDateOfBirth(dob);
  if (dobError) fieldErrors.dob = dobError;
  const phoneError = validatePhone(phone);
  if (phoneError) fieldErrors.phone = phoneError;
  const emailError = validateEmailAddress(email);
  if (emailError) fieldErrors.email = emailError;
  const currentEmail = (user.email ?? "").toLowerCase();
  let emailRemoved = false;
  if (!email && currentEmail) {
    // Detachment goes through a locked-down RPC (migration 0033): only
    // the caller's own row, phone login untouched. Auth offers no API
    // for this — null/empty updates are silently ignored.
    const { error: removeError } = await supabase.rpc("remove_own_email");
    if (removeError) {
      return {
        fieldErrors: { email: "Couldn't remove email. Please try again." },
      };
    }
    emailRemoved = true;
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Email change goes through auth (confirmation lands in the new inbox).
  // Do it first: nothing persistent changes until the link is clicked.
  if (email && email !== (user.email ?? "").toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email });
    if (emailError) {
      return { fieldErrors: { email: "Couldn't change email. Please try again." } };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      date_of_birth: dob,
      phone: phone || null,
    })
    .eq("id", user.id);

  if (error) {
    if (/date_of_birth|phone[^s]|column/i.test(error.message)) {
      // Migration 0020 hasn't applied: the new columns don't exist yet,
      // so the whole update fails and nothing is saved.
      return {
        error:
          "couldn't save — New profile fields aren't ready yet (database update pending). Please try again later.",
      };
    }
    return { error: "Couldn't save your profile. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  // user.email was read before the removal, so an emptied field means
  // the address just came off (not "unchanged").
  return {
    message:
      email && email !== (user.email ?? "").toLowerCase()
        ? "Profile saved. Confirmation sent to the new email."
        : emailRemoved
          ? "Profile saved. Email removed."
          : "Profile saved.",
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
  if (!user) return { error: "You must be signed in to change your password." };

  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: FieldErrors = {};
  if (next.length < 8)
    fieldErrors.newPassword = "Password must be at least 8 characters.";
  else if (next !== confirm)
    fieldErrors.confirmPassword = "Passwords don't match.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return { error: "Couldn't change password. Please try again." };
  }
  return { message: "Password changed." };
}

/**
 * Permanently delete the caller's account. Deleting the auth user
 * cascades through profiles, rides, conversations, messages, push
 * subscriptions, blocks, reports, and unread marks (all FKs are
 * `on delete cascade`). Chat images are NOT cascaded by storage, so
 * they're removed best-effort first; orphans there are contentless
 * paths once the conversation rows are gone. The two `set null`
 * references (wanted_routes, arrival_tracking) detach cleanly.
 * Nothing here is recoverable — the client makes the user type DELETE.
 */
export async function deleteAccount(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in to delete your account." };
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();

  try {
    const { data: convs } = await admin
      .from("conversations")
      .select("id")
      .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`);
    for (const c of (convs ?? []) as { id: string }[]) {
      const { data: files } = await admin.storage
        .from("chat-images")
        .list(c.id);
      const paths = (files ?? []).map((f) => `${c.id}/${f.name}`);
      if (paths.length > 0) {
        await admin.storage.from("chat-images").remove(paths);
      }
    }
  } catch {
    // Storage cleanup is best-effort; the account deletion below still
    // removes every database row, which is what matters.
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: "Couldn't delete your account. Please try again." };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
