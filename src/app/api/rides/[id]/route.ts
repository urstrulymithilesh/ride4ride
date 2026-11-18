import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public ride summary for the pin sheet. Only active posts, only
 * coarse fields — exact addresses never leave ride_locations (see
 * rides_with_location + RLS), and this endpoint doesn't touch them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: ride, error } = await supabase
    .from("rides")
    .select(
      "id, type, owner_id, from_city, from_state, to_city, to_state, from_street, to_street, ride_date, time_mode, ride_time, distance_meters, description",
    )
    .eq("id", id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !ride) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Owner handle for the card's identity row. Profiles are
  // world-readable; a missing handle degrades to no row, not an error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", ride.owner_id)
    .maybeSingle<{ username: string | null }>();

  const { owner_id: _owner, ...rest } = ride;
  void _owner;
  return NextResponse.json({
    ride: { ...rest, username: profile?.username ?? null },
  });
}
