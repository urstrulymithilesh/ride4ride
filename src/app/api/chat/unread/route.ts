import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Caller's unread chat total for the dock badge. Signed-out callers get
 * zero (no badge), never an error.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ unread: 0 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_message_count");
  if (error || typeof data !== "number") {
    // Migration 0030 not applied yet (or RPC hiccup): no badge rather
    // than a wrong number.
    console.error("[chat/unread] count failed:", error?.message);
    return NextResponse.json({ unread: 0 });
  }
  return NextResponse.json({ unread: Math.max(0, data) });
}
