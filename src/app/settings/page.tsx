import Link from "next/link";
import type { Metadata } from "next";
import { EnableNotifications } from "@/components/notifications/enable-notifications";

export const metadata: Metadata = { title: "settings" };

export default function SettingsPage() {
  return (
    <main className="w-full flex-1 px-4">
      <section aria-label="notifications" className="card mt-4 p-5">
        <h1 className="text-sm font-semibold text-content">reminders</h1>
        <div className="mt-3">
          <EnableNotifications />
        </div>
      </section>

      <nav aria-label="about" className="mt-3 flex flex-col gap-2">
        <Link href="/privacy" className="btn btn-secondary w-full">
          privacy
        </Link>
        <Link href="/terms" className="btn btn-secondary w-full">
          terms
        </Link>
      </nav>
    </main>
  );
}
