"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/admin";
import type { ReportStatus } from "@/types";

const STATUSES: ReportStatus[] = ["open", "reviewed", "actioned", "dismissed"];

/** All admin mutations funnel through here: verify admin, then act as service role. */
async function requireAdminClient() {
  if (!(await isCurrentUserAdmin())) return null;
  return createAdminClient();
}

export async function setReportStatus(formData: FormData): Promise<void> {
  const admin = await requireAdminClient();
  if (!admin) return;
  const id = String(formData.get("reportId") ?? "");
  const status = String(formData.get("status") ?? "") as ReportStatus;
  if (!id || !STATUSES.includes(status)) return;
  await admin.from("reports").update({ status }).eq("id", id);
  revalidatePath("/admin");
}

/** Take down a post: cancel it (hidden from browse; owner keeps a record). */
export async function takedownRide(formData: FormData): Promise<void> {
  const admin = await requireAdminClient();
  if (!admin) return;
  const rideId = String(formData.get("rideId") ?? "");
  if (!rideId) return;
  await admin.from("rides").update({ status: "cancelled" }).eq("id", rideId);
  await admin
    .from("reports")
    .update({ status: "actioned" })
    .eq("target_ride_id", rideId)
    .eq("status", "open");
  revalidatePath("/admin");
  revalidatePath("/rides");
}

/** Ban a user: set the flag (blocks posting/messaging via RLS) and cancel their live posts. */
export async function banUser(formData: FormData): Promise<void> {
  const admin = await requireAdminClient();
  if (!admin) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await admin.from("profiles").update({ is_banned: true }).eq("id", userId);
  await admin
    .from("rides")
    .update({ status: "cancelled" })
    .eq("owner_id", userId)
    .eq("status", "active");
  await admin
    .from("reports")
    .update({ status: "actioned" })
    .eq("target_user_id", userId)
    .eq("status", "open");
  revalidatePath("/admin");
}

export async function unbanUser(formData: FormData): Promise<void> {
  const admin = await requireAdminClient();
  if (!admin) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await admin.from("profiles").update({ is_banned: false }).eq("id", userId);
  revalidatePath("/admin");
}
