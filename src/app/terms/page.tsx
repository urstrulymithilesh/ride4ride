import type { Metadata } from "next";

export const metadata: Metadata = { title: "terms of service" };

export default function TermsPage() {
  return (
    <main className="w-full flex-1 px-4 py-8">
      <div className="mb-6 rounded-xl bg-danger-soft p-3 text-sm text-content">
        <strong>placeholder — not legal advice.</strong> this is a template.
        have a qualified attorney review and finalize these terms before launch.
      </div>

      <h1 className="text-2xl font-semibold text-content">terms of service</h1>
      <p className="mt-2 text-sm text-muted">
        last updated: (date). by using ride4ride you agree to these terms.
      </p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">1. who can use ride4ride</h2>
          <p>you must be 18 or older to create an account, and you must accept these terms. we confirm that you control the email address you sign up with. we do not verify your identity, age, driving licence, insurance, or vehicle, and we do not run background checks. you are responsible for activity on your account.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">2. rides are between users</h2>
          <p>ride4ride is a platform to connect people offering and seeking rides. we are not a party to, and do not vet, screen, insure, or supervise any ride, driver, passenger, or transaction. you arrange and take rides at your own risk.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">3. safety</h2>
          <p>meet in public first, tell someone your plans, and use your judgment before sharing an address or meeting anyone. report and block features are provided but do not guarantee safety.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">4. acceptable use</h2>
          <p>no harassment, fraud, illegal activity, or misuse of others&apos; information. we may remove posts and suspend accounts that violate these terms.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">5. content &amp; addresses</h2>
          <p>full addresses for &lsquo;get&rsquo; rides are shared with another user only after both of you agree. do not share others&apos; personal information outside the platform.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">6. money is entirely between users</h2>
          <p>ride4ride never sets, suggests, calculates, caps, or displays a price for any ride. there is no price field anywhere on the platform. if riders and drivers agree to share costs, they arrange that amount themselves, in their own words, entirely between themselves and off the platform.</p>
          <p className="mt-2">ride4ride does not process, hold, transfer, guarantee, or take a share of any payment. <strong className="text-content">the service is free and will remain free: we do not charge users and we take no fee or commission on any ride, ever.</strong></p>
        </section>
        <section>
          <h2 className="font-semibold text-content">7. your conversations are private</h2>
          <p>messages between two users can be read only by those two users. we do not read conversation contents — not for moderation, not for analytics, not for research, and not to improve the product. there are no exceptions to this.</p>
          <p className="mt-2">if you report a conversation, you choose what to include in that report. reporting does not give us access to the rest of the thread.</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">8. disclaimers &amp; liability</h2>
          <p>the service is provided &ldquo;as is,&rdquo; without warranties. to the extent permitted by law, ride4ride is not liable for interactions between users. (your attorney should tailor this section.)</p>
        </section>
        <section>
          <h2 className="font-semibold text-content">9. contact</h2>
          <p>questions about these terms: legal@ride4ride.com.</p>
        </section>
      </div>
    </main>
  );
}
