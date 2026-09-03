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
  const purgeable: string[] = [];
  const failures: string[] = [];

  // Remove each conversation's images from Storage (folder = conversationId).
  //
  // ORDERING MATTERS. Previously both Storage calls discarded their error
  // and the conversation row was deleted regardless. If listing or removal
  // failed, the images survived in Storage while the row pointing at them
  // was gone — so nothing would ever try to delete them again. Chat images
  // outliving their conversation is a privacy failure, not a tidiness one
  // (see TODOS.md P-1: chat privacy is absolute).
  //
  // So a conversation is only queued for deletion once its images are
  // actually gone. Anything that fails is left in place and retried on the
  // next run, which is safe because this job is idempotent.
  for (const id of ids) {
    const { data: files, error: listError } = await admin.storage
      .from(CHAT_BUCKET)
      .list(id, { limit: 1000 });

    if (listError) {
      console.error(`[cron/purge-chats] listing images failed for ${id}:`, listError.message);
      failures.push(`list ${id}: ${listError.message}`);
      continue; // keep the conversation; retry next run
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${id}/${f.name}`);
      const { data: removed, error: removeError } = await admin.storage
        .from(CHAT_BUCKET)
        .remove(paths);

      if (removeError) {
        console.error(`[cron/purge-chats] removing images failed for ${id}:`, removeError.message);
        failures.push(`remove ${id}: ${removeError.message}`);
        continue; // keep the conversation; retry next run
      }
      deletedImages += removed?.length ?? 0;
    }

    purgeable.push(id);
  }

  // Delete only the conversations whose images are confirmed gone.
  if (purgeable.length > 0) {
    const { error: delErr } = await admin
      .from("conversations")
      .delete()
      .in("id", purgeable);
    if (delErr) {
      console.error("[cron/purge-chats] conversation delete failed:", delErr.message);
      return NextResponse.json(
        { error: delErr.message, deletedImages, failures },
        { status: 500 },
      );
    }
  }

  const body = {
    deletedConversations: purgeable.length,
    deletedImages,
    ...(failures.length > 0 ? { skipped: ids.length - purgeable.length, failures } : {}),
  };

  // A run that could not purge everything it was asked to must not report 200.
  return NextResponse.json(body, { status: failures.length > 0 ? 500 : 200 });
}
