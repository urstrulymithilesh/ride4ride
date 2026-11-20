import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Privacy & Terms" };

/**
 * Privacy policy + terms of service on one page: the profile footer
 * links here as "Privacy & Terms". Both halves are placeholders —
 * a qualified attorney should review and finalize them before launch.
 */
export default function PrivacyTermsPage() {
  return (
    <main className="w-full flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Privacy & Terms
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="mb-6 mt-4 rounded-xl bg-danger-soft p-3 text-sm text-content">
        <strong>Placeholder — not legal advice.</strong> These templates
        reflect how the app is built, but a qualified attorney should review
        and finalize them (and confirm obligations like FERPA/GDPR/CCPA as
        they apply) before launch.
      </div>

      <h1 className="sr-only">Privacy & Terms</h1>
      <p className="mt-2 text-sm text-muted">Last updated: (date).</p>

      <h2 className="mt-8 text-[15px] font-semibold text-content">Privacy</h2>
      <div className="mt-4 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h3 className="font-semibold text-content">What we collect</h3>
          <p>Account info (email, display name), ride posts (cities/state/zip; and for &lsquo;get&rsquo; rides, exact addresses and coordinates), messages and images you send, and technical data needed to run the service. Device location is handled separately — see below.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">Device location</h3>
          <p>ride4ride asks for your device location so the map can center on you and the feed can be sorted by distance. If you block that permission, you can choose a city manually instead. Either choice stays in your browser and is remembered on this device for up to 30 days so you aren&rsquo;t asked every time; it is not sent to our servers, stored in your account, or written to a cookie. Map pins show an approximate city-level pickup area, never the poster&rsquo;s exact address.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">How addresses are protected</h3>
          <p>Exact pickup/drop-off addresses and precise coordinates are stored separately and are never shown publicly. They are disclosed to another user only after both of you explicitly agree to reveal them. This is enforced by our database access rules, not just the interface.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">Messages &amp; retention</h3>
          <p>Conversations are temporary: they and their images are automatically deleted 24 hours after creation (for current rides) or 24 hours after the ride date (for future rides). Expired posts may be removed automatically.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">How we use data</h3>
          <p>To operate the service: matching, messaging, distance calculation, expiry notifications, and safety (reports/blocks/moderation). We do not sell your personal information.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">Third parties</h3>
          <p>We use supabase (auth, database, storage), vercel (hosting), Mapbox (address suggestions, geocoding, and driving distance), and OpenStreetMap for map tiles. A push service delivers notifications you opt into.</p>
          <p className="mt-2">When you type in an address field, Mapbox receives that text to return suggestions. It is used only to produce the list and is not stored by us until you post.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">Your choices</h3>
          <p>You can edit your profile, delete posts, block users, and delete your account from settings. Notification permissions can be revoked in your browser.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">Contact</h3>
          <p>Privacy questions: privacy@ride4ride.com.</p>
        </section>
      </div>

      <h2 className="mt-10 text-[15px] font-semibold text-content">Terms</h2>
      <p className="mt-2 text-sm text-muted">
        By using ride4ride you agree to these terms.
      </p>
      <div className="mt-4 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h3 className="font-semibold text-content">1. Who can use ride4ride</h3>
          <p>You must be 18 or older to create an account, and you must accept these terms. We confirm that you control the email address you sign up with. We do not verify your identity, age, driving licence, insurance, or vehicle, and we do not run background checks. You are responsible for activity on your account.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">2. Rides are between users</h3>
          <p>ride4ride is a platform to connect people offering and seeking rides. We are not a party to, and do not vet, screen, insure, or supervise any ride, driver, passenger, or transaction. You arrange and take rides at your own risk.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">3. Safety</h3>
          <p>Meet in public first, tell someone your plans, and use your judgment before sharing an address or meeting anyone. Report and block features are provided but do not guarantee safety.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">4. Acceptable use</h3>
          <p>No harassment, fraud, illegal activity, or misuse of others&apos; information. We may remove posts and suspend accounts that violate these terms.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">5. Content &amp; addresses</h3>
          <p>Full addresses for &lsquo;get&rsquo; rides are shared with another user only after both of you agree. Do not share others&apos; personal information outside the platform.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">6. Money is entirely between users</h3>
          <p>ride4ride never sets, suggests, calculates, caps, or displays a price for any ride. There is no price field anywhere on the platform. If riders and drivers agree to share costs, they arrange that amount themselves, in their own words, entirely between themselves and off the platform.</p>
          <p className="mt-2">ride4ride does not process, hold, transfer, guarantee, or take a share of any payment. <strong className="text-content">The service is free and will remain free: we do not charge users and we take no fee or commission on any ride, ever.</strong></p>
        </section>
        <section>
          <h3 className="font-semibold text-content">7. Your conversations are private</h3>
          <p>Messages between two users can be read only by those two users. We do not read conversation contents — not for moderation, not for analytics, not for research, and not to improve the product. There are no exceptions to this.</p>
          <p className="mt-2">If you report a conversation, you choose what to include in that report. Reporting does not give us access to the rest of the thread.</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">8. Disclaimers &amp; liability</h3>
          <p>The service is provided &ldquo;as is,&rdquo; without warranties. To the extent permitted by law, ride4ride is not liable for interactions between users. (Your attorney should tailor this section.)</p>
        </section>
        <section>
          <h3 className="font-semibold text-content">9. Contact</h3>
          <p>Questions about these terms: legal@ride4ride.com.</p>
        </section>
      </div>
    </main>
  );
}
