import type { Metadata } from "next";

export const metadata: Metadata = { title: "support" };

/**
 * Support: where to go for help. Account and post issues route to the
 * in-app surfaces (report buttons, profile); everything else goes to
 * email. Deliberately plain — a contact page, not a ticket system.
 */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">support</h1>
      <div className="card mt-4 space-y-4 p-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">something wrong?</h2>
          <p className="mt-1">
            email{" "}
            <a
              href="mailto:admin@ride4ride.com"
              className="font-medium text-primary"
            >
              admin@ride4ride.com
            </a>{" "}
            with what happened and, if it is about a post, its link.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-content">
            someone bothering you?
          </h2>
          <p className="mt-1">
            use the report buttons on the post or in the chat, or block them
            from the conversation. reports go to a human review queue.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-content">your account</h2>
          <p className="mt-1">
            display name and username are editable from your profile page.
          </p>
        </section>
      </div>
    </main>
  );
}
