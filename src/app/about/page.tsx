import type { Metadata } from "next";

export const metadata: Metadata = { title: "about" };

export default function AboutPage() {
  return (
    <main className="w-full flex-1 px-4">
      <h1 className="text-xl font-semibold text-content">about</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        ride4ride is a free board for sharing rides. offer a ride
        you&apos;re already taking, or find one going your way.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        browsing is open to everyone. only log in when you&apos;re ready to
        connect — your exact addresses stay private until both sides agree
        to share them.
      </p>
    </main>
  );
}
