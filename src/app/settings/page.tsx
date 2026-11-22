import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { PasswordForm, ProfileDetails } from "@/components/profile/profile-details";
import { DeleteAccountForm } from "@/components/profile/delete-account";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Settings" };

/** YYYY-MM-DD -> m/d/yyyy for display. */
function formatDob(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${m}/${d}/${y}`;
}

export default async function ProfilePage() {
  const user = await requireUser("/settings");
  const profile = await getProfile();

  if (!profile) {
    throw new Error("Couldn't load your profile.");
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Settings
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <p className="mt-1 text-sm text-muted">
        Logged in as {profile.display_name}.
      </p>

      <ProfileDetails
        displayName={profile.display_name}
        dob={profile.date_of_birth ?? ""}
        dobDisplay={formatDob(profile.date_of_birth)}
        email={user.email ?? ""}
        phone={profile.phone ?? ""}
      />

      <PasswordForm />

      <section
        aria-label="Delete account"
        className="mt-6 rounded-xl border border-danger/40 p-5"
      >
        <h2 className="text-[15px] font-semibold text-danger">
          Delete account
        </h2>
        <p className="mt-1 text-sm text-muted">
          Permanently removes your profile, posts, and chats.
        </p>
        <div className="mt-3">
          <DeleteAccountForm />
        </div>
      </section>

      <nav aria-label="Settings" className="mt-3 flex flex-col gap-2">
        {profile.is_admin ? (
          <Link href="/admin" className="btn btn-secondary w-full">
            Admin
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
