"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { FieldErrors } from "@/lib/validations/auth";
import type { ReportReason } from "@/types";

const REASONS: ReportReason[] = [
  "spam",
  "harassment",
  "scam",
  "safety",
  "inappropriate",
  "other",
];

export interface ReportState {
  error?: string;
  fieldErrors?: FieldErrors;
  done?: boolean;
}

/**
 * File a report against a post or a user. RLS enforces reporter_id = self;
 * reports are visible only to the reporter and to admins (service role).
 */
export async function reportContent(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await getUser();
  if (!user) return { error: "Please sign in to report." };

  const targetType = String(formData.get("targetType") ?? "");
  const reason = String(formData.get("reason") ?? "") as ReportReason;
  const details = String(formData.get("details") ?? "").trim();
  const targetRideId = String(formData.get("targetRideId") ?? "") || null;
  const targetUserId = String(formData.get("targetUserId") ?? "") || null;

  if (targetType !== "post" && targetType !== "user")
    return { error: "Invalid report target." };
  if (!REASONS.includes(reason))
    return { fieldErrors: { reason: "Choose a reason." } };
  if (targetType === "post" && !targetRideId)
    return { error: "Missing post to report." };
  if (targetType === "user" && !targetUserId)
    return { error: "Missing user to report." };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    target_ride_id: targetType === "post" ? targetRideId : null,
    target_user_id: targetType === "user" ? targetUserId : null,
    reason,
    details: details || null,
  });

  if (error) return { error: "Couldn't submit the report. Please try again." };
  return { done: true };
}

/** Block another user. Enforced in RLS: blocked pairs can't start/continue chats. */
export async function blockUser(formData: FormData): Promise<void> {
  const user = await getUser();
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const redirectPath = String(formData.get("redirectPath") ?? "/messages");
  if (!user || !targetUserId || targetUserId === user.id) return;

  const supabase = await createClient();
  await supabase
    .from("blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: targetUserId },
      { onConflict: "blocker_id,blocked_id" },
    );
  revalidatePath(redirectPath);
}

/** Remove a block. */
export async function unblockUser(formData: FormData): Promise<void> {
  const user = await getUser();
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const redirectPath = String(formData.get("redirectPath") ?? "/messages");
  if (!user || !targetUserId) return;

  const supabase = await createClient();
  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);
  revalidatePath(redirectPath);
}
