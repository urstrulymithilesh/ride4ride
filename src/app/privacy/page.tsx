import type { Metadata } from "next";

export const metadata: Metadata = { title: "privacy policy" };

export default function PrivacyPage() {
  return (
    <main className="w-full flex-1 px-4 py-8">
      <div className="mb-6 rounded-xl bg-danger-soft p-3 text-sm text-content">
        <strong>placeholder — not legal advice.</strong> this template reflects
        how the app is built, but a qualified attorney should review and
        finalize it (and confirm obligations like ferpa/gdpr/ccpa as they apply).
      </div>

      <h1 className="text-2xl font-semibold text-content">privacy policy</h1>
      <p className="mt-2 text-sm text-muted">last updated: (date).</p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">what we collect</h2>
          <p>account info (email, display name), ride posts (cities/state/zip; and for &lsquo;get&rsquo; rides, exact addresses and coordinates), messages and images you send, and technical data needed to run the service.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">how addresses are protected</h2>
          <p>exact pickup/drop-off addresses and precise coordinates are stored separately and are never shown publicly. they are disclosed to another user only after both of you explicitly agree to reveal them. this is enforced by our database access rules, not just the interface.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">messages &amp; retention</h2>
          <p>conversations are temporary: they and their images are automatically deleted 24 hours after creation (for current rides) or 24 hours after the ride date (for future rides). expired posts may be removed automatically.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">how we use data</h2>
          <p>to operate the service: matching, messaging, distance calculation, expiry notifications, and safety (reports/blocks/moderation). we do not sell your personal information.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">third parties</h2>
          <p>we use supabase (auth, database, storage), vercel (hosting), and a mapping provider (geocoding/distance). a push service delivers notifications you opt into.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">your choices</h2>
          <p>you can edit your profile, delete posts, block users, and request account deletion. notification permissions can be revoked in your browser.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">contact</h2>
          <p>privacy questions: privacy@ride4ride.com.</p>
        </section>
      </div>
    </main>
  );
}
