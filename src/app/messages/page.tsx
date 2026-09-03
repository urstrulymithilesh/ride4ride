import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPlace } from "@/lib/utils/format";
import type { Conversation } from "@/types";

export const metadata: Metadata = { title: "Messages" };

interface RideRoute {
  id: string;
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
}

export default async function MessagesPage() {
  const user = await requireUser("/messages");
  const supabase = await createClient();

  // RLS returns only conversations the user participates in. Newest-first.
  const { data: conversations, error: convosError } = await supabase
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Conversation[]>();

  if (convosError) {
    // Without this, a failed query renders "No conversations yet" — telling
    // someone their chat history is gone when it is sitting there fine.
    console.error("[messages] conversation list query failed:", convosError.message, convosError);
  }

  const convos = conversations ?? [];

  // Batch-fetch the other participant's name and the ride route.
  const otherIds = [
    ...new Set(
      convos.map((c) =>
        c.participant_one === user.id ? c.participant_two : c.participant_one,
      ),
    ),
  ];
  const rideIds = [...new Set(convos.map((c) => c.ride_id).filter(Boolean))] as string[];

  const [{ data: profiles }, { data: rides }] = await Promise.all([
    otherIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", otherIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    rideIds.length
      ? supabase
          .from("rides")
          .select("id, from_city, from_state, to_city, to_state")
          .in("id", rideIds)
          .returns<RideRoute[]>()
      : Promise.resolve({ data: [] as RideRoute[] }),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const rideById = new Map((rides ?? []).map((r) => [r.id, r]));

  return (
    <main className="w-full flex-1 px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-content">Messages</h1>

      {convosError ? (
        /* ERROR state, deliberately not the empty state: "no conversations"
           and "we couldn't load your conversations" mean opposite things. */
        <div
          role="alert"
          className="card border border-danger bg-transparent p-8 text-center"
        >
          <p className="text-sm font-semibold text-content">
            Couldn&apos;t load your messages.
          </p>
          <p className="mt-1 text-sm text-muted">
            Something went wrong on our side. Your conversations are still
            there — we just can&apos;t show them right now.
          </p>
          <Link
            href="/messages"
            className="mt-3 inline-block text-sm font-medium text-primary"
          >
            Try again
          </Link>
        </div>
      ) : convos.length === 0 ? (
        <div className="card border border-dashed border-hairline bg-transparent p-8 text-center">
          <p className="text-sm text-muted">No conversations yet.</p>
          <Link
            href="/rides"
            className="mt-3 inline-block text-sm font-medium text-primary"
          >
            Browse rides to start one
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {convos.map((c) => {
            const otherId =
              c.participant_one === user.id ? c.participant_two : c.participant_one;
            const other = nameById.get(otherId) ?? "A member";
            const ride = c.ride_id ? rideById.get(c.ride_id) : undefined;
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className="card flex min-h-11 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-content">{other}</p>
                    {ride ? (
                      <p className="truncate text-sm text-muted">
                        {formatPlace(ride.from_city, ride.from_state)} →{" "}
                        {formatPlace(ride.to_city, ride.to_state)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-faint">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
