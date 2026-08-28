import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { OfferForm } from "./offer-form";

export const metadata: Metadata = { title: "Offer a ride" };

export default async function OfferRidePage() {
  await requireUser("/rides/offer");

  return (
    <main className="w-full flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">Offer a ride</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Share a trip you&apos;re already taking. City to city — no address needed.
      </p>
      <OfferForm />
    </main>
  );
}
