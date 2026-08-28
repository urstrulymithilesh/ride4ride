import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Post a ride" };

export default async function NewRidePage() {
  await requireUser("/rides/new");

  return (
    <main className="w-full flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">Post a ride</h1>
      <p className="mt-1 mb-6 text-sm text-muted">What would you like to do?</p>

      <div className="flex flex-col gap-4">
        <Link
          href="/rides/offer"
          className="card border-l-4 border-l-success"
        >
          <h2 className="font-semibold text-content">Offer a ride</h2>
          <p className="mt-1 text-sm text-muted">
            You&apos;re driving. City to city, no address required.
          </p>
        </Link>

        <Link href="/rides/get" className="card border-l-4 border-l-primary">
          <h2 className="font-semibold text-content">Get a ride</h2>
          <p className="mt-1 text-sm text-muted">
            You need a ride. Exact addresses, kept private.
          </p>
        </Link>
      </div>
    </main>
  );
}
