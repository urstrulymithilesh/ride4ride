import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  RESERVED_USERNAMES,
  USERNAME_RE,
} from "@/lib/validations/auth";
import { BackButton } from "@/components/ui/back-button";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";

export const metadata: Metadata = { title: "Posts" };

/** A profile's active posts. No dock here either — back goes home. */
export default async function ProfilePostsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  await requireUser();
  const { username: raw } = await params;
  const name = (raw ?? "").toLowerCase();
  if (!USERNAME_RE.test(name) || RESERVED_USERNAMES.has(name)) notFound();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", name)
    .maybeSingle<{ id: string; username: string }>();

  if (!profile) notFound();

  const { data: rides } = await supabase
    .from("rides")
    .select(
      "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, time_mode, ride_time, distance_meters, from_street, to_street, description",
    )
    .eq("owner_id", profile.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<RideCardData[]>();

  const list = (rides ?? []).map((r) => ({
    ...r,
    username: profile.username,
  }));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback={`/${profile.username}`} />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Posts
        </h1>
        <span aria-hidden="true" className="min-h-11 min-w-11" />
      </div>

      {list.length === 0 ? (
        <div className="card mt-6 border border-dashed border-hairline bg-transparent p-8 text-center">
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
