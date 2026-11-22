import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  RESERVED_USERNAMES,
  USERNAME_RE,
} from "@/lib/validations/auth";
import { signOut } from "@/app/(auth)/actions";
import {
  formatAge,
  formatJoined,
} from "@/lib/utils/format";
import { ChangeLocationButton } from "@/components/location/change-location";
import { Avatar } from "@/components/profile/avatar";
import { ProfileWhere } from "@/components/profile/profile-where";
import type { Profile } from "@/types";

export const metadata: Metadata = { title: "Profile" };

/**
 * Profile page: ride4ride.com/<username>. No dock here — the back arrow
 * returns to wherever you came from, and the menu rows below replace
 * the dock's destinations (My posts, Notifications, Help, Log out).
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const name = (raw ?? "").toLowerCase();
  // Validate before auth: reserved/dead handles 404 for everyone instead
  // of bouncing signed-out visitors to login.
  if (!USERNAME_RE.test(raw ?? "") || RESERVED_USERNAMES.has(name)) notFound();
  const viewer = await requireUser();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, date_of_birth, gender, created_at",
    )
    .ilike("username", name)
    .maybeSingle<
      Pick<
        Profile,
        "id" | "display_name" | "username" | "date_of_birth" | "gender" | "created_at"
      >
    >();

  if (!profile) notFound();

  // Canonical CamelCase URL: /midnightramen -> /MidnightRamen.
  if (raw !== profile.username) redirect(`/${profile.username}`);

  const isOwner = profile.id === viewer.id;

  // Other people's city = their latest active post's pickup (their GPS
  // is theirs). Owners get the live line instead (see ProfileWhere).
  const { data: latestRide } = await supabase
    .from("rides")
    .select("from_city, from_state")
    .eq("owner_id", profile.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ from_city: string; from_state: string }>();

  const age = formatAge(profile.date_of_birth);
  const joined = formatJoined(profile.created_at);
  const city = latestRide
    ? `${latestRide.from_city}, ${latestRide.from_state}`
    : null;

  const row =
    "flex min-h-14 w-full items-center text-[26px] font-medium text-content hover:text-white";

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-left text-[17px] font-semibold text-content">
          Profile
        </h1>
        {isOwner ? (
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center text-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        ) : (
          <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
        )}
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Avatar gender={profile.gender} size={60} />
          <p className="wrap-anywhere rounded-lg border-[0.5px] border-white/20 px-2 py-0.5 text-center text-[12px] text-muted">
            <span className="font-normal text-muted">@</span>
            <span className="font-semibold text-content">{profile.username}</span>
          </p>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="wrap-anywhere truncate text-[15px] font-semibold text-content">
            {profile.display_name}
            {age !== null ? <span className="text-muted">, {age}</span> : ""}
          </p>
          {joined ? (
            <p className="mt-0.5 text-[13px] text-muted">Joined {joined}</p>
          ) : null}
          {isOwner ? (
            <ProfileWhere />
          ) : city ? (
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.2 2.8Q21.5 2.3 21 3.6L12.9 20.6Q12.4 21.4 12 20.6V12.4Q12 11.9 11.5 11.9H3.4Q2.6 11.9 2.6 11.1V10.9Q2.6 10.4 3.2 10.2Z" />
              </svg>
              <span className="wrap-anywhere truncate">{city}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 h-px bg-white/10"
      />

      <nav aria-label="Profile" className="mt-4 flex flex-col gap-1">
        <Link href={`/${profile.username}/posts`} className={row}>
          {isOwner ? "My posts" : "Posts"}
        </Link>
        {isOwner ? (
          <Link href="/notifications" className={row}>
            Notifications
          </Link>
        ) : null}
        <Link href="/help" className={row}>
          Help
        </Link>
        {isOwner ? (
          <form action={signOut}>
            <button type="submit" className={row}>
              Log out
            </button>
          </form>
        ) : null}
        {/* Dev-only: the drawer that used to host this is unwired from
            the dock, so manual location override lives here in dev. */}
        {isOwner && process.env.NODE_ENV !== "production" ? (
          <ChangeLocationButton className={`${row} text-left`} />
        ) : null}
      </nav>

      <footer className="mx-auto mt-8 w-full max-w-[480px] px-4 pb-28">
        <nav
          aria-label="Legal"
          className="pointer-events-auto flex items-center justify-center gap-2 text-[11px] text-muted"
        >
          <Link href="/privacy-terms" className="underline underline-offset-4 hover:text-content">
            Privacy & Terms
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/about" className="underline underline-offset-4 hover:text-content">
            About
          </Link>
          <span aria-hidden="true">•</span>
          <Link
            href="/dev"
            className="underline underline-offset-4 hover:text-content"
          >
            Developer info
          </Link>
        </nav>
      </footer>
    </main>
  );
}
