import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/components/chat/chat-thread";
import { RevealPanel } from "@/components/chat/reveal-panel";
import { VerifiedBadge } from "@/components/safety/verified-badge";
import { ReportButton } from "@/components/safety/report-button";
import { blockUser, unblockUser } from "@/app/safety/actions";
import { formatPlace } from "@/lib/utils/format";
import type { Conversation, Message } from "@/types";

interface RideForChat {
  id: string;
  type: "offer" | "get";
  owner_id: string;
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
}

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const supabase = await createClient();

  // RLS hides conversations the user isn't part of => notFound.
  const { data: convo } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Conversation>();
  if (!convo) notFound();

  const otherId =
    convo.participant_one === user.id
      ? convo.participant_two
      : convo.participant_one;

  const [{ data: other }, { data: ride }, { data: messages }, { data: block }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, verification")
        .eq("id", otherId)
        .maybeSingle<{ display_name: string; verification: "unverified" | "pending" | "verified" }>(),
      convo.ride_id
        ? supabase
            .from("rides")
            .select("id, type, owner_id, from_city, from_state, to_city, to_state")
            .eq("id", convo.ride_id)
            .maybeSingle<RideForChat>()
        : Promise.resolve({ data: null }),
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .returns<Message[]>(),
      // Have I blocked the other person? (I can only see my own blocks.)
      supabase
        .from("blocks")
        .select("blocked_id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", otherId)
        .maybeSingle(),
    ]);

  const otherName = other?.display_name ?? "the other person";
  const iBlocked = Boolean(block);

  // Reveal handshake state (only for 'get' rides, which have addresses).
  let revealProps: {
    viewerId: string;
    initialReveal: { owner_agreed: boolean; viewer_agreed: boolean } | null;
    initialAddresses: { from_address: string; to_address: string } | null;
  } | null = null;

  if (ride && ride.type === "get") {
    const viewerId =
      convo.participant_one === ride.owner_id
        ? convo.participant_two
        : convo.participant_one;

    const [{ data: reveal }, { data: addresses }] = await Promise.all([
      supabase
        .from("ride_reveals")
        .select("owner_agreed, viewer_agreed")
        .eq("ride_id", ride.id)
        .eq("viewer_id", viewerId)
        .maybeSingle<{ owner_agreed: boolean; viewer_agreed: boolean }>(),
      // RLS returns this only to the owner or an agreed viewer; null otherwise.
      supabase
        .from("ride_locations")
        .select("from_address, to_address")
        .eq("ride_id", ride.id)
        .maybeSingle<{ from_address: string; to_address: string }>(),
    ]);

    revealProps = {
      viewerId,
      initialReveal: reveal ?? null,
      initialAddresses: addresses ?? null,
    };
  }

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-4">
      <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="min-w-0">
          <Link
            href="/messages"
            className="inline-flex min-h-11 items-center text-xs text-muted hover:text-content"
          >
            ← All messages
          </Link>
          <h1 className="flex items-center gap-1.5 font-semibold text-content">
            <span className="truncate">{other?.display_name ?? "A member"}</span>
            <VerifiedBadge verification={other?.verification} />
          </h1>
        </div>
        {ride ? (
          <Link
            href={`/rides/${ride.id}`}
            className="wrap-anywhere shrink-0 text-right text-xs text-muted hover:text-content"
          >
            {formatPlace(ride.from_city, ride.from_state)} →{" "}
            {formatPlace(ride.to_city, ride.to_state)}
          </Link>
        ) : null}
      </div>

      {/* Safety controls */}
      <div className="mt-2">
        {iBlocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft p-2 text-xs">
            <span className="text-content">
              You blocked this person. Messaging is paused.
            </span>
            <form action={unblockUser}>
              <input type="hidden" name="targetUserId" value={otherId} />
              <input type="hidden" name="redirectPath" value={`/messages/${id}`} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center font-medium text-primary"
              >
                Unblock
              </button>
            </form>
          </div>
        ) : (
          <details className="text-xs text-muted">
            <summary className="inline-flex min-h-11 cursor-pointer select-none items-center">
              Safety
            </summary>
            <div className="mt-1 flex flex-col gap-2 rounded-xl border border-hairline p-3">
              <form action={blockUser}>
                <input type="hidden" name="targetUserId" value={otherId} />
                <input type="hidden" name="redirectPath" value={`/messages/${id}`} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center font-medium text-danger"
                >
                  Block this person
                </button>
              </form>
              <ReportButton targetType="user" targetUserId={otherId} label="Report this person" />
            </div>
          </details>
        )}
      </div>

      {ride && revealProps ? (
        <div className="pt-4">
          <RevealPanel
            conversationId={id}
            rideId={ride.id}
            viewerId={revealProps.viewerId}
            ownerId={ride.owner_id}
            currentUserId={user.id}
            otherName={otherName}
            initialReveal={revealProps.initialReveal}
            initialAddresses={revealProps.initialAddresses}
          />
        </div>
      ) : null}

      <ChatThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={messages ?? []}
      />
    </main>
  );
}
