import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { BackButton } from "@/components/ui/back-button";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";

export const metadata: Metadata = { title: "My posts" };

/**
 * Your own active posts at ride4ride.com/posts. Same list the profile's
 * "My posts" row shows, without needing the username in the URL.
 * No dock here — back goes home.
 */
export default async function MyPostsPage() {
  const user = await requireUser("/posts");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle<{ username: string }>();

  const { data: rides } = await supabase
    .from("rides")
    .select(
      "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, time_mode, ride_time, distance_meters, from_street, to_street, description",
    )
    .eq("owner_id", user.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<RideCardData[]>();

  const list = (rides ?? []).map((r) => ({
    ...r,
    username: profile?.username ?? "",
  }));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          My posts
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>

      {list.length === 0 ? (
        <div className="card mt-4 border border-dashed border-hairline bg-transparent p-8 text-center">
          <p className="text-sm text-muted">No active posts right now.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3 pb-8">
          {list.map((r) => (
            <li key={r.id}>
              <RideCard ride={r} signedIn />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
