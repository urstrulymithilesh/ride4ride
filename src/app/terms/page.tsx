import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="w-full flex-1 px-4 py-8">
      <div className="mb-6 rounded-xl bg-danger-soft p-3 text-sm text-content">
        <strong>Placeholder — not legal advice.</strong> This is a template.
        Have a qualified attorney review and finalize these Terms before launch.
      </div>

      <h1 className="text-2xl font-semibold text-content">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">
        Last updated: (date). By using Ride4Ride you agree to these terms.
      </p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">1. Who can use Ride4Ride</h2>
          <p>You must be 18 or older to create an account. Accounts confirmed with a student email address display a verification badge; the badge is informational and is not a background check, an identity check, or a guarantee of anything. You are responsible for activity on your account.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">2. Rides are between users</h2>
          <p>Ride4Ride is a platform to connect people offering and seeking rides. We are not a party to, and do not vet, screen, insure, or supervise any ride, driver, passenger, or transaction. You arrange and take rides at your own risk.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">3. Safety</h2>
          <p>Meet in public first, tell someone your plans, and use your judgment before sharing an address or meeting anyone. Report and block features are provided but do not guarantee safety.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">4. Acceptable use</h2>
          <p>No harassment, fraud, illegal activity, or misuse of others&apos; information. We may remove posts and suspend accounts that violate these terms.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">5. Content &amp; addresses</h2>
          <p>Full addresses for &lsquo;get&rsquo; rides are shared with another user only after both of you agree. Do not share others&apos; personal information outside the platform.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">6. Money is entirely between users</h2>
          <p>Ride4Ride never sets, suggests, calculates, caps, or displays a price for any ride. There is no price field anywhere on the platform. If riders and drivers agree to share costs, they arrange that amount themselves, in their own words, entirely between themselves and off the platform.</p>
          <p className="mt-2">Ride4Ride does not process, hold, transfer, guarantee, or take a share of any payment. <strong className="text-content">The service is free and will remain free: we do not charge users and we take no fee or commission on any ride, ever.</strong></p>
        </section>
        <section>
          <h2 className="font-semibold text-content">7. Your conversations are private</h2>
          <p>Messages between two users can be read only by those two users. We do not read conversation contents — not for moderation, not for analytics, not for research, and not to improve the product. There are no exceptions to this.</p>
          <p className="mt-2">If you report a conversation, you choose what to include in that report. Reporting does not give us access to the rest of the thread.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">8. Disclaimers &amp; liability</h2>
          <p>The service is provided &ldquo;as is,&rdquo; without warranties. To the extent permitted by law, Ride4Ride is not liable for interactions between users. (Your attorney should tailor this section.)</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">9. Contact</h2>
          <p>Questions about these terms: legal@ride4ride.com.</p>
        </section>
      </div>
    </main>
  );
}
