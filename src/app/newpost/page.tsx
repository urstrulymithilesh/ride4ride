import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { QuickPostForm } from "@/components/rides/quick-post";

export const metadata: Metadata = { title: "new post" };

/**
 * Full-page post composer (the dock + button lands here). Same form as
 * the old popup, rendered as a regular page — no overlay, no portal.
 */
export default async function NewPostPage() {
  await requireUser("/newpost");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-content">new post</h1>
      <div className="mt-6">
        <QuickPostForm />
      </div>
    </main>
  );
}
