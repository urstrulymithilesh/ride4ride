import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { GetForm } from "./get-form";

export const metadata: Metadata = { title: "Get a ride" };

export default async function GetRidePage() {
  await requireUser("/rides/get");

  return (
    <main className="w-full flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">Get a ride</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Enter your exact pickup and drop-off. We&apos;ll calculate the distance;
        your addresses stay private until a match is agreed.
      </p>
      <GetForm />
    </main>
  );
}
