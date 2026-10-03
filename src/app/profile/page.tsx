import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata: Metadata = { title: "profile" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
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
        signed in as {user.email ?? "your account"}. only your display name
        and username are editable — everything else is set by the platform.
      </p>

      <section
        aria-label="account details"
        className="card mt-4 p-5"
      >
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted">username</dt>
            <dd className="wrap-anywhere text-content">@{profile.username}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">display name</dt>
            <dd className="wrap-anywhere text-content">
              {profile.display_name}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">email</dt>
            <dd className="wrap-anywhere text-content">
              {user.email ?? "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">verification</dt>
            <dd className="text-content capitalize">{profile.verification}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">member since</dt>
            <dd className="text-content">{formatDate(profile.created_at)}</dd>
          </div>
          {profile.school ? (
            <div className="min-w-0">
              <dt className="text-muted">school</dt>
              <dd className="wrap-anywhere text-content">{profile.school}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-label="edit profile" className="card mt-3 p-5">
        <h2 className="text-sm font-semibold text-content">edit profile</h2>
        <div className="mt-3">
          <ProfileForm
            displayName={profile.display_name}
            username={profile.username}
          />
        </div>
      </section>

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
