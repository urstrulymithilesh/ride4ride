import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's own handle, for client chrome (the dock profile icon)
 * that server components can't reach. 401/404 carry no user data.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle<{ username: string | null }>();

  if (!profile?.username) {
    return NextResponse.json({ error: "no profile" }, { status: 404 });
  }
  return NextResponse.json({ username: profile.username });
}
