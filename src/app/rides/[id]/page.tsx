import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { CopyLinkButton } from "@/components/rides/copy-link-button";
import { EnableNotifications } from "@/components/notifications/enable-notifications";
import { ReportButton } from "@/components/safety/report-button";
import { startConversation } from "@/app/messages/actions";
import { repostRide } from "@/app/rides/actions";
import { formatDistance, formatPlace, formatRideWhen } from "@/lib/utils/format";
import { recordArrival } from "@/lib/arrivals";
import type { RideWithLocation } from "@/types";

/**
 * Per-post metadata, because pasting a post link into a group chat IS the
 * distribution mechanism. A bare URL with the title "Ride" is a wasted
 * share; "Chicago, IL → Naperville, IL · Fri Sep 4" is one someone might
 * actually tap.
 *
 * PRIVACY. This runs on a PUBLIC page and its output is handed to
 * third-party crawlers (WhatsApp, Telegram, Slack), which may cache it
 * indefinitely and outside our control. So it selects the anonymous
 * column set ONLY — city, state, date, direction, distance. Never zip,
 * never `description` (free text, sign-in gated on the page itself), and
 * never anything from `ride_locations`. Widening this select is a
 * privacy decision, not a formatting one.
 *
 * noindex is preserved from T6: fine to hand someone in a chat, wrong to
 * leave in a search index where it outlives the ride. Messenger crawlers
 * read OG tags and ignore robots meta, so previews still work — and per
 * the Next docs, streaming metadata is disabled for those bots, so the
 * tags land in <head> where they expect them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = { title: "ride", robots: { index: false } };

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: ride, error } = await supabase
      .from("rides")
      .select(
        "type, from_city, from_state, to_city, to_state, ride_date, is_future, distance_meters, status",
      )
      .eq("id", id)
      .maybeSingle<{
        type: "offer" | "get";
        from_city: string;
        from_state: string;
        to_city: string;
        to_state: string;
        ride_date: string | null;
        is_future: boolean;
        distance_meters: number | null;
        status: string;
      }>();

    // Never throw from here: a metadata failure must not take the page
    // down with it. Generic metadata is a fine degradation.
    if (error || !ride) return fallback;

    const route = `${formatPlace(ride.from_city, ride.from_state)} → ${formatPlace(
      ride.to_city,
      ride.to_state,
    )}`;
    const when = formatRideWhen(ride.ride_date, ride.is_future);
    const distance = formatDistance(ride.distance_meters);

    // A shared link often gets tapped days later. Say so in the preview
    // rather than letting someone open a dead post expecting a live one.
    const stale = ride.status !== "active" ? `[${ride.status}] ` : "";
    const title = `${stale}${route} · ${when}`;
    const description = [
      ride.type === "offer"
        ? "someone is driving this route and has seats."
        : "someone is looking for a ride on this route.",
      distance ? `about ${distance}.` : null,
      "ride4ride is a free board for arranging rides directly with other people.",
    ]
      .filter(Boolean)
      .join(" ");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

    return {
      title,
      description,
      robots: { index: false },
      openGraph: {
        title,
        description,
        type: "website",
        siteName: "ride4ride",
        ...(siteUrl ? { url: `${siteUrl}/rides/${id}` } : {}),
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return fallback;
  }
}

export default async function RideDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  // Action failure codes are written as ?error= by startConversation
  // (chat blocked/failed) and repostRide (repost failed). Reading them
  // here closes the loop: without this the page reloads with no feedback.
  const actionError = (await searchParams)?.error;
  const supabase = await createClient();

  // rides_with_location is RLS-aware: address fields are null unless the
  // viewer is the owner or an agreed counterparty. RLS also hides inactive
  // rides from non-owners (=> notFound).
  const { data: ride, error: rideError } = await supabase
    .from("rides_with_location")
    .select("*")
    .eq("id", id)
    .maybeSingle<RideWithLocation>();

  // Same failure class as the feed, and worse here: without this check a
  // query failure renders "not found", telling someone who followed a
  // shared link that the post was deleted when it may be sitting there
  // fine. Throw instead, so error.tsx shows a real error and the failure
  // reaches the server log.
  if (rideError) {
    console.error("[rides/:id] detail query failed:", rideError.message, rideError);
    throw new Error("couldn't load this ride.");
  }

  if (!ride) notFound();

  const user = await getUser();

  // Recorded AFTER the ride resolves, so a 404 for a missing post is not
  // counted as someone arriving at the board.
  await recordArrival("post", user?.id);

  const isOwner = user?.id === ride.owner_id;
  const distance = formatDistance(ride.distance_meters);
  const kindLabel = ride.type === "offer" ? "ride available" : "need ride";

  // Poster identity is part of "full details" — only fetch/expose to signed-in.
  let posterName: string | null = null;
  if (user) {
    const { data: poster } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", ride.owner_id)
      .maybeSingle<{ display_name: string }>();
    posterName = poster?.display_name ?? "a member";
  }

  return (
    <main className="w-full flex-1 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/rides"
          className="inline-flex min-h-11 items-center text-sm text-muted hover:text-content"
        >
          ← back
        </Link>
        <CopyLinkButton path={`/rides/${ride.id}`} />
      </div>

      {actionError === "chat" ? (
        <p
          role="alert"
          className="card mt-3 border border-danger bg-transparent p-4 text-sm text-content"
        >
          Couldn&apos;t open the chat. If messaging is paused between you
          two, it stays closed until the block is lifted — otherwise try
          again.
        </p>
      ) : null}
      {actionError === "repost" ? (
        <p
          role="alert"
          className="card mt-3 border border-danger bg-transparent p-4 text-sm text-content"
        >
          Couldn&apos;t repost. Please try again.
        </p>
      ) : null}

      {/* Basic info — public / shareable */}
      <div className="card mt-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`chip ${
              ride.type === "offer"
                ? "bg-success-soft text-success"
                : "bg-primary-soft text-primary"
            }`}
          >
            {kindLabel}
          </span>
          {ride.status !== "active" ? (
            <span className="chip bg-surface-2 text-muted">{ride.status}</span>
          ) : null}
        </div>

        <h1 className="wrap-anywhere mt-2 text-2xl font-semibold text-content">
          {formatPlace(ride.from_city, ride.from_state)} →{" "}
          {formatPlace(ride.to_city, ride.to_state)}
        </h1>

        {ride.from_airport ? (
          <p className="mt-2 text-sm font-medium text-muted">
            ✈ {ride.from_airport}
          </p>
        ) : null}

        {ride.type === "get" && (ride.from_street || ride.to_street) ? (
          <p className="mt-2 text-sm text-muted">
            {ride.from_street ? `${ride.from_street} → ` : ""}
            {ride.to_street ?? ""}
            <span className="text-xs"> (street names only, no house numbers)</span>
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted">when</dt>
            <dd className="wrap-anywhere text-content">
              {formatRideWhen(ride.ride_date, ride.is_future)}
            </dd>
          </div>
          {distance ? (
            <div className="min-w-0">
              <dt className="text-muted">trip distance</dt>
              <dd className="text-content">{distance}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* Full details — gated behind sign-in */}
      <div className="mt-3">
        {user ? (
          <div className="card p-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted">posted by</dt>
                <dd className="flex flex-wrap items-center gap-1.5 text-content">
                  <span className="wrap-anywhere">{posterName}</span>
                </dd>
              </div>
              {ride.description ? (
                <div>
                  <dt className="text-muted">description</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap text-content">
                    {ride.description}
                  </dd>
                </div>
              ) : null}
            </dl>

            {isOwner ? (
              <>
                <OwnerAddresses
                  fromAddress={ride.from_address}
                  toAddress={ride.to_address}
                />
                <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                  {ride.status === "expired" ? (
                    <form action={repostRide}>
                      <input type="hidden" name="rideId" value={ride.id} />
                      <button type="submit" className="btn btn-primary w-full">
                        repost
                      </button>
                      <p className="mt-2 text-xs text-muted">
                        republish this expired post with a fresh expiry.
                      </p>
                    </form>
                  ) : null}
                  <EnableNotifications />
                </div>
              </>
            ) : (
              <div className="mt-4 border-t border-hairline pt-4">
                <form action={startConversation}>
                  <input type="hidden" name="rideId" value={ride.id} />
                  <button type="submit" className="btn btn-primary w-full">
                    message the poster
                  </button>
                  <p className="mt-2 text-xs text-muted">
                    opens the chat with a quick hello to break the ice.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    for &lsquo;get&rsquo; rides, exact addresses are shared only
                    after you both agree in chat.
                  </p>
                </form>
                <div className="mt-3">
                  <ReportButton targetType="post" targetRideId={ride.id} label="report this post" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <SignInPrompt
            action="see full details and contact the poster"
            redirectTo={`/rides/${ride.id}`}
          />
        )}
      </div>
    </main>
  );
}

/** Owner-only panel: your own private addresses, never shown to others. */
function OwnerAddresses({
  fromAddress,
  toAddress,
}: {
  fromAddress?: string | null;
  toAddress?: string | null;
}) {
  if (!fromAddress && !toAddress) return null;
  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <h2 className="text-sm font-semibold text-content">
        your addresses (private)
      </h2>
      <p className="mt-1 text-xs text-muted">
        only you can see these. they&apos;re shared with a rider only after you
        both agree to proceed.
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-muted">pickup</dt>
          <dd className="wrap-anywhere text-content">{fromAddress}</dd>
        </div>
        <div>
          <dt className="text-muted">drop-off</dt>
          <dd className="wrap-anywhere text-content">{toAddress}</dd>
        </div>
      </dl>
    </div>
  );
}
