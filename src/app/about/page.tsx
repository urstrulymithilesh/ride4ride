import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <main className="w-full flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          About
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        ride4ride is a free board for sharing rides. Offer a ride
        you&apos;re already taking, or find one going your way.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Browsing is open to everyone. Only log in when you&apos;re ready to
        connect — your exact addresses stay private until both sides agree
        to share them.
      </p>
    </main>
  );
}
