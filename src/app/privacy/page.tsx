import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="w-full flex-1 px-4 py-8">
      <div className="mb-6 rounded-xl bg-danger-soft p-3 text-sm text-content">
        <strong>Placeholder — not legal advice.</strong> This template reflects
        how the app is built, but a qualified attorney should review and
        finalize it (and confirm obligations like FERPA/GDPR/CCPA as they apply).
      </div>

      <h1 className="text-2xl font-semibold text-content">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: (date).</p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">What we collect</h2>
          <p>Account info (email, display name), ride posts (cities/state/ZIP; and for &lsquo;get&rsquo; rides, exact addresses and coordinates), messages and images you send, and technical data needed to run the service.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">How addresses are protected</h2>
          <p>Exact pickup/drop-off addresses and precise coordinates are stored separately and are never shown publicly. They are disclosed to another user only after both of you explicitly agree to reveal them. This is enforced by our database access rules, not just the interface.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Messages &amp; retention</h2>
          <p>Conversations are temporary: they and their images are automatically deleted 24 hours after creation (for current rides) or 24 hours after the ride date (for future rides). Expired posts may be removed automatically.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">How we use data</h2>
          <p>To operate the service: matching, messaging, distance calculation, expiry notifications, and safety (reports/blocks/moderation). We do not sell your personal information.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Third parties</h2>
          <p>We use Supabase (auth, database, storage), Vercel (hosting), and a mapping provider (geocoding/distance). A push service delivers notifications you opt into.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Your choices</h2>
          <p>You can edit your profile, delete posts, block users, and request account deletion. Notification permissions can be revoked in your browser.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Contact</h2>
          <p>Privacy questions: privacy@ride4ride.com.</p>
        </section>
      </div>
    </main>
  );
}
