"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setRevealAgreement } from "@/app/messages/actions";
import type { RideReveal } from "@/types";

interface Addresses {
  from_address: string;
  to_address: string;
}

/**
 * Address-reveal handshake for 'get' rides, shown inside the conversation.
 * Reflects the DB state (ride_reveals) and lets each party set ONLY their own
 * agreement. Addresses are shown only once `agreed` is true — and even then
 * they're fetched under RLS, so the UI can't reveal what the DB won't return.
 */
export function RevealPanel({
  conversationId,
  rideId,
  viewerId,
  ownerId,
  currentUserId,
  otherName,
  initialReveal,
  initialAddresses,
}: {
  conversationId: string;
  rideId: string;
  viewerId: string;
  ownerId: string;
  currentUserId: string;
  otherName: string;
  initialReveal: { owner_agreed: boolean; viewer_agreed: boolean } | null;
  initialAddresses: Addresses | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const iAmOwner = currentUserId === ownerId;

  const [ownerAgreed, setOwnerAgreed] = useState(initialReveal?.owner_agreed ?? false);
  const [viewerAgreed, setViewerAgreed] = useState(initialReveal?.viewer_agreed ?? false);
  const [addresses, setAddresses] = useState<Addresses | null>(initialAddresses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revealed = ownerAgreed && viewerAgreed;
  const myAgreed = iAmOwner ? ownerAgreed : viewerAgreed;
  const theirAgreed = iAmOwner ? viewerAgreed : ownerAgreed;

  function applyReveal(r: Pick<RideReveal, "owner_agreed" | "viewer_agreed">) {
    setOwnerAgreed(r.owner_agreed);
    setViewerAgreed(r.viewer_agreed);
  }

  // Once revealed, make sure we have the addresses (viewer fetches them under
  // RLS the moment they're allowed; owner already had them).
  useEffect(() => {
    if (!revealed || addresses) return;
    let active = true;
    supabase
      .from("ride_locations")
      .select("from_address, to_address")
      .eq("ride_id", rideId)
      .maybeSingle<Addresses>()
      .then(({ data }) => {
        if (active && data) setAddresses(data);
      });
    return () => {
      active = false;
    };
  }, [revealed, addresses, supabase, rideId]);

  // Live handshake updates from the other party.
  useEffect(() => {
    const channel = supabase
      .channel(`reveal:${rideId}:${viewerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_reveals",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new as RideReveal | undefined;
          if (row && row.viewer_id === viewerId) applyReveal(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, rideId, viewerId]);

  async function setAgreement(agree: boolean) {
    setBusy(true);
    setError(null);
    const res = await setRevealAgreement(conversationId, agree);
    if (res.error) setError(res.error);
    else if (res.reveal) applyReveal(res.reveal);
    setBusy(false);
  }

  // ----- Revealed -----
  if (revealed) {
    return (
      <div className="mb-4 rounded-2xl bg-success-soft p-4">
        <div className="flex items-center gap-2">
          <span aria-hidden>✅</span>
          <p className="text-sm font-semibold text-success">Addresses revealed</p>
        </div>
        {addresses ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">Pickup</dt>
              <dd className="wrap-anywhere text-content">{addresses.from_address}</dd>
            </div>
            <div>
              <dt className="text-muted">Drop-off</dt>
              <dd className="wrap-anywhere text-content">{addresses.to_address}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">Loading addresses…</p>
        )}
      </div>
    );
  }

  // ----- Not yet revealed -----
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <p className="text-sm font-semibold text-content">
          Addresses hidden until both agree
        </p>
      </div>

      <p className="mt-1 text-sm text-muted">
        {theirAgreed
          ? `${otherName} agreed to reveal addresses. Confirm to share both exact addresses.`
          : myAgreed
            ? `Waiting for ${otherName} to confirm.`
            : "When you both agree, the full pickup and drop-off addresses become visible to the two of you only."}
      </p>

      <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
        <p className="font-medium text-content">Before you share addresses, stay safe:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Meet in a public place first — don&apos;t go straight to a home.</li>
          <li>Tell a friend your plans and who you&apos;re meeting.</li>
          <li>Only reveal once you&apos;re comfortable proceeding.</li>
          <li>Report anything that feels off — you can block this person anytime.</li>
        </ul>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        {!myAgreed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAgreement(true)}
            className="btn btn-success w-full"
          >
            {theirAgreed
              ? "Confirm & reveal"
              : iAmOwner
                ? "Agree to share my addresses"
                : "Request to reveal addresses"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAgreement(false)}
            className="btn btn-secondary w-full"
          >
            Cancel my request
          </button>
        )}
      </div>
    </div>
  );
}
