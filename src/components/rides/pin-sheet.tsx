"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startConversation } from "@/app/chat/actions";
import { ChatIcon } from "@/components/places/search-icons";
import { abbreviateStreet } from "@/lib/utils/format";
import {
  addDays,
  todayInZone,
  timezoneForState,
} from "@/lib/pickup-tz";

interface PinRide {
  id: string;
  type: string;
  from_city: string;
  from_state: string;
  to_city: string;
  to_state: string;
  from_street: string | null;
  to_street: string | null;
  ride_date: string | null;
  time_mode: "asap" | "anytime" | "at";
  ride_time: string | null;
  distance_meters: number | null;
  description: string | null;
  username: string | null;
}

/** Dotted 12h clock ("7.00 pm"), matching the pin pills. */
function clockDots(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return `${h12}.${String(m).padStart(2, "0")} ${suffix}`;
}

/** Header timing, always "Day · Time":
 *  "Today · Now" / "Today · Anytime" / "Today · 10.00 pm" /
 *  "Tomorrow · Anytime" / "Nov 20 · 10.00 pm". Days are pickup-local,
 *  same rule as the pills. */
function whenLine(ride: PinRide): string {
  const tz = timezoneForState(ride.from_state);
  const today = todayInZone(tz);
  const time =
    ride.time_mode === "asap"
      ? "Now"
      : ride.time_mode === "anytime"
        ? "Anytime"
        : ride.ride_time
          ? clockDots(ride.ride_time)
          : "Anytime";
  const day =
    !ride.ride_date || ride.ride_date <= today
      ? "Today"
      : ride.ride_date === addDays(today, 1)
        ? "Tomorrow"
        : (() => {
            const [y, m, d] = (ride.ride_date as string)
              .split("-")
              .map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          })();
  return `${day} · ${time}`;
}

/** Street when the poster gave one, else city + state. */
function endLabel(street: string | null, city: string, state: string): string {
  return street
    ? `${abbreviateStreet(street) ?? street}, ${city}`
    : `${city}, ${state}`;
}

/** Prefilled composer copy, flipped by post type. */
function openerFor(type: string): string {
  return type === "get"
    ? "Do you still need ride?"
    : "Do you still offer a ride?";
}

/**
 * Pin sheet: 360-wide glass card (same fill/radius/opacity as the dock)
 * that pops right below the framed pin — the pin always lands at screen
 * center-x, y=128, so this fixed spot is directly under it. Header
 * (kind · day · time), street-level route, owner row with the dock's
 * chat glyph as a shortcut into the 1:1 conversation.
 */
export function PinSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [ride, setRide] = useState<PinRide | null>(null);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  // One-line route fit: widen the card first, then shrink the type,
  // stopping at the screen edge and at 12px (readability floor).
  const [cardW, setCardW] = useState(360);
  const [fontPx, setFontPx] = useState(12);
  const routeRef = useRef<HTMLParagraphElement | null>(null);

  // One-line route fit: widen the card first, then shrink the type,
  // stopping at the screen edge and at 12px. Driven from the fetch
  // callback (plus rAF rechecks), never from an effect, so each step
  // measures committed DOM. Retries also cover the commit landing after
  // the first frame. All reads come from the DOM (never stale state);
  // every step strictly progresses, so the loop always ends.
  // useCallback (stable, ref/state-setter only) so the fetch effect can
  // depend on it without refetching.
  const fitRoute = useRef(0);
  const fit = useCallback(function fit(): void {
    const el = routeRef.current;
    // The fetch callback fires before React commits the new route text;
    // poll (bounded) instead of assuming the DOM is ready, and the same
    // retries cover a slow first paint.
    if (!el) {
      if (fitRoute.current++ < 120) requestAnimationFrame(fit);
      return;
    }
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const card = el.closest("[data-sheet-card]");
    const cardWNow = card instanceof HTMLElement ? card.clientWidth : 360;
    const maxW = Math.min(480, window.innerWidth) - 24;
    if (cardWNow < maxW - 1) {
      setCardW(Math.min(maxW, cardWNow + 12));
    } else {
      const px = parseFloat(getComputedStyle(el).fontSize) || 12;
      if (px > 12.01) setFontPx(Math.max(12, +(px - 0.5).toFixed(1)));
      else return;
    }
    requestAnimationFrame(fit);
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/rides/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live) return;
        if (data?.ride) {
          setRide(data.ride as PinRide);
          setCardW(360);
          setFontPx(12);
          setSent(false);
          fitRoute.current = 0;
          requestAnimationFrame(fit);
        } else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, fitRoute, fit]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[136px] z-[var(--z-chrome)] mx-auto flex w-full max-w-[480px] justify-center px-3">
      <div
        style={{ width: cardW }}
        className="flex max-w-[calc(100vw-24px)] flex-col gap-[2px]"
      >
      <div
        role="dialog"
        aria-label={ride ? "Ride details" : "Loading ride"}
        data-sheet-card
        className="glass-dark pointer-events-auto max-h-[240px] w-full overflow-y-auto rounded-[10px] px-3 pt-1 pb-[12px] opacity-90"
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[15px] font-semibold text-content">
            {ride ? (
              <>
                <span
                  className={
                    ride.type === "get" ? "text-[#34c759]" : "text-content"
                  }
                >
                  {ride.type === "get" ? "Need Ride" : "Ride Available"}
                </span>{" "}
                · {whenLine(ride)}
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-9 w-9 shrink-0 -mr-2 items-center justify-center rounded-full text-white/60 hover:text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>
        {!ride && !failed ? (
          <p className="mt-8 text-center text-xs text-faint">Loading…</p>
        ) : null}
        {failed ? (
          <p className="mt-8 text-center text-xs text-muted">
            Couldn&apos;t load this ride.
          </p>
        ) : null}
        {ride ? (
          <>
            <div>
              <p
                ref={routeRef}
                style={{ fontSize: fontPx }}
                title={`${endLabel(ride.from_street, ride.from_city, ride.from_state)} → ${endLabel(ride.to_street, ride.to_city, ride.to_state)}`}
                className="overflow-hidden text-ellipsis whitespace-nowrap tracking-tight text-white/70"
              >
                {endLabel(ride.from_street, ride.from_city, ride.from_state)}
                <span aria-hidden="true" className="mx-2">
                  →
                </span>
                {endLabel(ride.to_street, ride.to_city, ride.to_state)}
              </p>
            </div>
          </>
        ) : null}
      </div>
      {ride ? (
        sent ? (
          <div
            role="status"
            className="glass-dark pointer-events-auto flex min-h-6 items-center justify-center rounded-[10px] p-2 opacity-90"
          >
            <p className="text-[12px] text-white">Message sent</p>
          </div>
        ) : (
        <form
          action={startConversation}
          onSubmit={() => setSent(true)}
          className="glass-dark pointer-events-auto flex items-center gap-2 rounded-[10px] p-2 opacity-90"
        >
          <input type="hidden" name="rideId" value={ride.id} />
          <input type="hidden" name="body" value={openerFor(ride.type)} />
          <span aria-hidden="true" className="shrink-0 pl-1 text-white">
            <ChatIcon size={20} />
          </span>
          <p
            aria-label="Message"
            className="flex min-h-6 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-white/20 text-ellipsis whitespace-nowrap bg-transparent px-3 text-white"
            style={{ fontSize: 12 }}
          >
            {openerFor(ride.type)}
          </p>
          <button
            type="submit"
            className="flex min-h-6 shrink-0 items-center rounded-lg bg-white px-4 text-sm font-semibold text-black"
          >
            Send
          </button>
        </form>
        )
      ) : null}
      </div>
    </div>
  );
}
