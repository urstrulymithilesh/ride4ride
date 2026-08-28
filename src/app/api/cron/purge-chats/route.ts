import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { CHAT_BUCKET } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes conversations whose auto_delete_at has passed, along with their
 * stored chat images. Messages are removed by the ON DELETE CASCADE on the
 * conversation FK; images live in Storage so they're deleted explicitly.
 *
 * Scheduled via vercel.json (see README). Idempotent — safe to run often.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await admin
    .from("conversations")
    .select("id")
    .lte("auto_delete_at", nowIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ deletedConversations: 0, deletedImages: 0 });
  }

  const ids = expired.map((c) => c.id);
  let deletedImages = 0;

  // Remove each conversation's images from Storage (folder = conversationId).
  for (const id of ids) {
    const { data: files } = await admin.storage.from(CHAT_BUCKET).list(id, {
      limit: 1000,
    });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${id}/${f.name}`);
      const { data: removed } = await admin.storage
        .from(CHAT_BUCKET)
        .remove(paths);
      deletedImages += removed?.length ?? 0;
    }
  }

  // Delete conversations (messages cascade).
  const { error: delErr } = await admin
    .from("conversations")
    .delete()
    .in("id", ids);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    deletedConversations: ids.length,
    deletedImages,
  });
}
