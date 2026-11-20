import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "Developer info" };

/**
 * Who builds Ride4Ride. Short by design — contact details live here so
 * the profile footer stays one line.
 */
export default function DeveloperInfoPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Developer info
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="card mt-4 space-y-4 p-5 text-sm leading-6 text-muted">
        <section>
          <p>
            Ride4Ride is designed, built, and maintained by an independent
            developer.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-content">Contact</h2>
          <p className="mt-1">
            Email{" "}
            <a
              href="mailto:admin@ride4ride.com"
              className="font-medium text-primary"
            >
              admin@ride4ride.com
            </a>{" "}
            for anything about the app.
          </p>
        </section>
      </div>
    </main>
  );
}
