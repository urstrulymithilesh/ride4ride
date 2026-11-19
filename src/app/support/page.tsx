import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Support" };

/**
 * Support: where to go for help. Account and post issues route to the
 * in-app surfaces (report buttons, profile); everything else goes to
 * email. Deliberately plain — a contact page, not a ticket system.
 */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Support
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="card mt-4 space-y-4 p-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">Something wrong?</h2>
          <p className="mt-1">
            Email{" "}
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
            Someone bothering you?
          </h2>
          <p className="mt-1">
            Use the report buttons on the post or in the chat, or block them
            from the conversation. Reports go to a human review queue.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Your account</h2>
          <p className="mt-1">
            Display name and username are editable from your profile page.
          </p>
        </section>
      </div>
    </main>
  );
}
