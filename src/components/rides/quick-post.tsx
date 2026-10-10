"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { submitQuickPost } from "@/app/rides/actions";

function PostButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-xl bg-white text-[15px] font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-12 sm:text-base"
    >
      {pending ? "posting…" : "post"}
    </button>
  );
}

function RadioDot({ checked }: { checked: boolean }) {  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        checked ? "border-white" : "border-white/40"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-white" : ""}`}
      />
    </span>
  );
}

/**
 * Quick-post popup opened from the dock + button. Same fields for both
 * modes (full addresses); give-rides posts derive city/state from
 * geocoding server-side. The dock +/X toggle is the ONLY way to close
 * it — backdrop taps, outside taps, Escape, and navigation all leave
 * it open. A successful post redirects behind it; the user closes via
 * X to see the new post.
 */
export function QuickPost() {
  // Portal out of the dock: its -translate-x-1/2 wrapper traps fixed
  // descendants, so without this the overlay anchors to the little dock
  // bar instead of the viewport. Mounts post-hydration (microtask, not a
  // sync setState) so SSR stays clean.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => {
      if (live) setMounted(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const [state, formAction] = useActionState(submitQuickPost, {});
  const [postMode, setPostMode] = useState<"need" | "give">("need");
  const [timing, setTiming] = useState<"asap" | "anytime" | "at">("anytime");

  // Placeholders follow the mode, matching the mocks: need-rides need
  // full addresses (geocoded + kept private), give-rides only need a
  // city-level place. Examples in the optional box match each side too.
  const addrPlaceholder =
    postMode === "need"
      ? "complete address is required for accuracy"
      : "city, university or airport";
  const optPlaceholder =
    postMode === "need"
      ? "write something..\n'i have luggage' or\n'need ride for 2 people' or\n'can split gas money' or\n'i will pay $10'"
      : "write something..\n'space available for up to 3 people' or\n'split gas money'";

  const pill = (active: boolean) =>
    `min-h-10 flex-1 rounded-xl border px-2 text-[13px] font-medium sm:min-h-11 sm:px-3 sm:text-sm ${
      active
        ? "border-white bg-white text-black"
        : "border-white/20 text-muted"
    }`;

  if (!mounted) return null;
  return createPortal(
    // z-30 sits BELOW the top bar and dock (both z-40), so both stay
    // sharp and tappable. The dim + blur cover the FULL viewport on
    // purpose: a middle-only band left a sharp unblurred seam wherever
    // its edge missed the real bar heights. Padding reserves the bar
    // zones so the panel never slides under either one.
    <div className="pointer-events-none fixed inset-0 z-30">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      <div className="pointer-events-auto absolute inset-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-h-full">
          <div className="m-auto w-full max-w-[340px] sm:max-w-sm">
          <div data-quickpost-panel className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-black p-3 sm:p-6">
            <form action={formAction} className="flex flex-col gap-2 sm:gap-4">
              <p className="text-center text-[11px] text-muted sm:text-xs">
                your privacy is most important and respected.
              </p>
              <div className="flex items-center justify-around gap-2" role="radiogroup" aria-label="post type">
            <label
              className={`flex min-h-10 cursor-pointer items-center gap-2 text-[13px] sm:min-h-11 sm:text-sm ${
                postMode === "need" ? "font-semibold text-content" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="postMode"
                value="need"
                checked={postMode === "need"}
                onChange={() => setPostMode("need")}
                className="sr-only"
              />
              <RadioDot checked={postMode === "need"} />i need ride
            </label>
            <label
              className={`flex min-h-10 cursor-pointer items-center gap-2 text-[13px] sm:min-h-11 sm:text-sm ${
                postMode === "give" ? "font-semibold text-content" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="postMode"
                value="give"
                checked={postMode === "give"}
                onChange={() => setPostMode("give")}
                className="sr-only"
              />
              <RadioDot checked={postMode === "give"} />i give ride
            </label>
          </div>

          <fieldset className="rounded-2xl border border-white/15 px-3 pb-1 sm:pb-3">
            <legend className="px-1 text-[11px] text-muted sm:text-xs">{postMode === "give" ? "from" : "pick up"}</legend>
            <input
              name="from_address"
              required
              minLength={5}
              placeholder={addrPlaceholder}
              aria-label="pickup address"
              className="input min-h-[22px] border-0 bg-transparent text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
            />
          </fieldset>
          {postMode === "need" ? (
            <p className="-mt-2 text-center text-[11px] text-muted sm:text-xs">
              don&apos;t worry, address information is kept private.
            </p>
          ) : null}

          <fieldset className="rounded-2xl border border-white/15 px-3 pb-1 sm:pb-3">
            <legend className="px-1 text-[11px] text-muted sm:text-xs">{postMode === "give" ? "to" : "drop off"}</legend>
            <input
              name="to_address"
              required
              minLength={5}
              placeholder={addrPlaceholder}
              aria-label="drop-off address"
              className="input min-h-[22px] border-0 bg-transparent text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
            />
          </fieldset>

          <div className="flex gap-2" role="radiogroup" aria-label="timing">
            {(
              [
                ["asap", "now"],
                ["anytime", "anytime"],
                ["at", "enter time"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="timing"
                  value={value}
                  checked={timing === value}
                  onChange={() => setTiming(value)}
                  className="sr-only"
                />
                <span className={`${pill(timing === value)} flex min-h-10 items-center justify-center sm:min-h-11`}>
                  {label}
                </span>
              </label>
            ))}
          </div>

          {timing === "at" ? (
            <input
              name="ride_time"
              type="time"
              required
              aria-label="time"
              className="input text-center"
            />
          ) : null}

          <fieldset className="rounded-2xl border border-white/15 px-3 pb-0.5 sm:pb-3">
            <legend className="px-1 text-[11px] text-muted sm:text-xs">note (optional)</legend>
            <textarea
              name="description"
              rows={postMode === "need" ? 5 : 3}
              placeholder={optPlaceholder}
              aria-label="optional details"
              className="input resize-none border-0 bg-transparent py-1 text-center text-[11px] leading-relaxed placeholder:text-[11px] sm:py-2 sm:text-xs sm:placeholder:text-xs"
            />
          </fieldset>

          {state.error ? (
            <p className="text-center text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.fieldErrors ? (
            <p className="text-center text-sm text-danger" role="alert">
              {Object.values(state.fieldErrors)[0]}
            </p>
          ) : null}

          <PostButton />
          </form>
          </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
