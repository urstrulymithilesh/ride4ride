import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { BackButton } from "@/components/ui/back-button";
import { EnableNotifications } from "@/components/notifications/enable-notifications";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Notification preferences: push opt-in for pre-expiry reminders.
 * No dock here — back returns to wherever you came from.
 */
export default async function NotificationPage() {
  await requireUser("/notifications");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-content">
          Notifications
        </h1>
        <span aria-hidden="true" className="block h-11 w-11 shrink-0" />
      </div>
      <div className="card mt-4 space-y-4 p-5 text-sm leading-6 text-muted">
        <section>
          <h2 className="font-semibold text-content">Expiry reminders</h2>
          <p className="mt-1">
            Get a push on this browser before your posts expire so you can
            repost in time.
          </p>
          <div className="mt-3">
            <EnableNotifications />
          </div>
        </section>
      </div>
    </main>
  );
}
