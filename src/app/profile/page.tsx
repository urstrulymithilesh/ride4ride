import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { PasswordForm, ProfileDetails } from "@/components/profile/profile-details";

export const metadata: Metadata = { title: "profile" };

/** YYYY-MM-DD -> m/d/yyyy for display. */
function formatDob(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${m}/${d}/${y}`;
}

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const profile = await getProfile();

  if (!profile) {
    throw new Error("couldn't load your profile.");
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">profile</h1>
      <p className="mt-1 text-sm text-muted">
        signed in as {user.email ?? "your account"}.
      </p>

      <ProfileDetails
        username={profile.username}
        displayName={profile.display_name}
        dob={profile.date_of_birth ?? ""}
        dobDisplay={formatDob(profile.date_of_birth)}
        email={user.email ?? ""}
        phone={profile.phone ?? ""}
      />

      <PasswordForm />

      <nav aria-label="account" className="mt-3 flex flex-col gap-2">
        <Link href="/messages" className="btn btn-secondary w-full">
          messages
        </Link>
        {profile.is_admin ? (
          <Link href="/admin" className="btn btn-secondary w-full">
            admin
          </Link>
        ) : null}
        <form action={signOut}>
          <button type="submit" className="btn btn-danger w-full">
            log out
          </button>
        </form>
      </nav>
    </main>
  );
}
