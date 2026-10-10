import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  RESERVED_USERNAMES,
  USERNAME_RE,
} from "@/lib/validations/auth";
import { RideCard, type RideCardData } from "@/components/rides/ride-card";

export const metadata: Metadata = { title: "profile" };

interface ProfileRow {
  id: string;
  display_name: string;
  username: string;
  created_at: string;
}

function memberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mon = d
    .toLocaleDateString("en-US", { month: "short" })
    .toLowerCase();
  return `member since ${mon}, ${d.getFullYear()}`;
}

/**
 * Public member page: ride4ride.com/<username>.
 *
 * Identity (name + posts) is full-details material, so viewing requires
 * sign-in — the same rule as the poster name on the detail page. Static
 * routes win over this dynamic segment, so /rides, /messages, /admin and
 * friends never land here; handles colliding with those names are
 * rejected at signup (RESERVED_USERNAMES) and 404 here as a second wall.
 * Only active posts, coarse columns only — never addresses.
 */
export default async function MemberPage({
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
    .select("id, display_name, username, created_at")
    .ilike("username", name)
    .maybeSingle<ProfileRow>();

  if (!profile) notFound();

  const { data: rides } = await supabase
    .from("rides")
    .select(
      "id, type, owner_id, created_at, from_city, from_state, to_city, to_state, ride_date, is_future, time_mode, ride_time, distance_meters, from_street, to_street, description",
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
  const since = memberSince(profile.created_at);

  return (
    <main className="w-full flex-1 px-4 py-6">
      <Link
        href="/rides"
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-content"
      >
        ← back
      </Link>

      <div className="card mt-3 p-5">
        <p className="wrap-anywhere text-xl font-semibold text-content">
          @{profile.username}
        </p>
        <p className="wrap-anywhere mt-1 text-sm text-muted">
          {profile.display_name}
        </p>
        {since ? (
          <p className="mt-1 text-xs text-muted">{since}</p>
        ) : null}
      </div>

      <h1 className="mt-6 text-sm font-semibold text-content">
        active posts · {list.length}
      </h1>
      {list.length === 0 ? (
        <div className="card mt-3 border border-dashed border-hairline bg-transparent p-8 text-center">
          <p className="text-sm text-muted">no active posts right now.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
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
