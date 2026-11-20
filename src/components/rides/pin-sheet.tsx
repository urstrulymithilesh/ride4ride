"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startConversation } from "@/app/chat/actions";
import { ChatIcon, PersonGlyph } from "@/components/places/search-icons";
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
  // One-line route fit: widen the card first, then shrink the type,
  // stopping at the screen edge and at 12px (readability floor).
  const [cardW, setCardW] = useState(360);
  const [fontPx, setFontPx] = useState(15);
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
      const px = parseFloat(getComputedStyle(el).fontSize) || 15;
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
          setFontPx(15);
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
        role="dialog"
        aria-label={ride ? "Ride details" : "Loading ride"}
        data-sheet-card
        style={{ width: cardW }}
        className="glass-dark pointer-events-auto relative max-h-[240px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[10px] px-3 pt-[18px] pb-[4px] opacity-90"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute top-2 right-2 flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/60 hover:text-white"
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
            <div className="pr-7">
              <p className="text-[13px] font-bold text-content">
                <span
                  className={
                    ride.type === "get" ? "text-[#34c759]" : "text-content"
                  }
                >
                  {ride.type === "get" ? "Need Ride" : "Ride Available"}
                </span>{" "}
                · {whenLine(ride)}
              </p>
              <p
                ref={routeRef}
                style={{ fontSize: fontPx }}
                title={`${endLabel(ride.from_street, ride.from_city, ride.from_state)} → ${endLabel(ride.to_street, ride.to_city, ride.to_state)}`}
                className="mt-[6px] overflow-hidden text-ellipsis whitespace-nowrap tracking-tight text-white/70"
              >
                {endLabel(ride.from_street, ride.from_city, ride.from_state)}
                <span aria-hidden="true" className="mx-2">
                  →
                </span>
                {endLabel(ride.to_street, ride.to_city, ride.to_state)}
              </p>
            </div>
            {ride.description || ride.username ? (
              <>
                <div
                  aria-hidden="true"
                  className="-mx-3 mt-2 border-t border-white opacity-50"
                />
                <div className="-mx-3 flex items-center justify-center gap-3 px-3 pt-2 text-[13px] text-white">
                {ride.username ? (
                  <span className="flex items-center gap-1.5">
                    <PersonGlyph height={11} />
                    <span className="wrap-anywhere font-semibold">
                      {ride.username}
                    </span>
                  </span>
                ) : null}
                <form action={startConversation} className="shrink-0">
                  <input type="hidden" name="rideId" value={ride.id} />
                  <button
                    type="submit"
                    aria-label="Message about this ride"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:text-white"
                  >
                    <ChatIcon size={20} />
                  </button>
                </form>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
