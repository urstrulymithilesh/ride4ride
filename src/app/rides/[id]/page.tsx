import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { CopyLinkButton } from "@/components/rides/copy-link-button";
import { EnableNotifications } from "@/components/notifications/enable-notifications";
import { VerifiedBadge } from "@/components/safety/verified-badge";
import { ReportButton } from "@/components/safety/report-button";
import { startConversation } from "@/app/messages/actions";
import { repostRide } from "@/app/rides/actions";
import { formatDistance, formatPlace, formatRideWhen } from "@/lib/utils/format";
import type { RideWithLocation } from "@/types";

export const metadata: Metadata = { title: "Ride" };

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // rides_with_location is RLS-aware: address fields are null unless the
  // viewer is the owner or an agreed counterparty. RLS also hides inactive
  // rides from non-owners (=> notFound).
  const { data: ride } = await supabase
    .from("rides_with_location")
    .select("*")
    .eq("id", id)
    .maybeSingle<RideWithLocation>();

  if (!ride) notFound();

  const user = await getUser();
  const isOwner = user?.id === ride.owner_id;
  const distance = formatDistance(ride.distance_meters);
  const kindLabel = ride.type === "offer" ? "Offer a ride" : "Get a ride";

  // Poster identity is part of "full details" — only fetch/expose to signed-in.
  let posterName: string | null = null;
  let posterVerification: "unverified" | "pending" | "verified" | null = null;
  if (user) {
    const { data: poster } = await supabase
      .from("profiles")
      .select("display_name, verification")
      .eq("id", ride.owner_id)
      .maybeSingle<{ display_name: string; verification: typeof posterVerification }>();
    posterName = poster?.display_name ?? "A member";
    posterVerification = poster?.verification ?? null;
  }

  return (
    <main className="w-full flex-1 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/rides"
          className="inline-flex min-h-11 items-center text-sm text-muted hover:text-content"
        >
          ← Back
        </Link>
        <CopyLinkButton path={`/rides/${ride.id}`} />
      </div>

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

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted">When</dt>
            <dd className="wrap-anywhere text-content">
              {formatRideWhen(ride.ride_date, ride.is_future)}
            </dd>
          </div>
          {distance ? (
            <div className="min-w-0">
              <dt className="text-muted">Trip distance</dt>
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
                <dt className="text-muted">Posted by</dt>
                <dd className="flex flex-wrap items-center gap-1.5 text-content">
                  <span className="wrap-anywhere">{posterName}</span>
                  <VerifiedBadge verification={posterVerification} />
                </dd>
              </div>
              {ride.description ? (
                <div>
                  <dt className="text-muted">Description</dt>
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
                        Repost
                      </button>
                      <p className="mt-2 text-xs text-muted">
                        Republish this expired post with a fresh expiry.
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
                    Message the poster
                  </button>
                  <p className="mt-2 text-xs text-muted">
                    For &lsquo;get&rsquo; rides, exact addresses are shared only
                    after you both agree in chat.
                  </p>
                </form>
                <div className="mt-3">
                  <ReportButton targetType="post" targetRideId={ride.id} label="Report this post" />
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
        Your addresses (private)
      </h2>
      <p className="mt-1 text-xs text-muted">
        Only you can see these. They&apos;re shared with a rider only after you
        both agree to proceed.
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-muted">Pickup</dt>
          <dd className="wrap-anywhere text-content">{fromAddress}</dd>
        </div>
        <div>
          <dt className="text-muted">Drop-off</dt>
          <dd className="wrap-anywhere text-content">{toAddress}</dd>
        </div>
      </dl>
    </div>
  );
}
