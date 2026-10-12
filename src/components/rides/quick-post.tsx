"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { submitQuickPost } from "@/app/rides/actions";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";

function PostButton({ skippable }: { skippable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-xl bg-white text-[15px] font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-12 sm:text-base"
    >
      {pending ? "posting…" : skippable ? "skip & post" : "post"}
    </button>
  );
}

/**
 * Infinitely looping option column (hour / minute). The option set is
 * rendered three times; crossing into an outer copy jumps the scroll by
 * exactly one set height, which reads as continuous. The selected value
 * highlights in every copy; the middle copy centers on mount.
 */
function LoopColumn({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll("[data-loop-item]");
    const target = items[options.findIndex((o) => o === value) + options.length];
    if (target instanceof HTMLElement) {
      el.scrollTop =
        target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2;
    }
    // Mount-only centering; afterwards the user owns the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el || el.scrollHeight <= 0) return;
    const setH = el.scrollHeight / 3;
    if (el.scrollTop < setH * 0.5) el.scrollTop += setH;
    else if (el.scrollTop + el.clientHeight > setH * 2.5)
      el.scrollTop -= setH;
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <p className="shrink-0 pb-1 text-center text-[11px] text-muted">
        {label}
      </p>
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        onScroll={onScroll}
        className="thin-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        {[0, 1, 2].map((copy) => (
          <div key={copy} className="flex flex-col gap-1 pb-1">
            {options.map((o) => (
              <button
                key={`${copy}-${o}`}
                type="button"
                data-loop-item
                role="option"
                aria-selected={o === value}
                onClick={() => onPick(o)}
                className={`min-h-10 shrink-0 rounded-lg text-sm ${
                  o === value
                    ? "bg-white font-semibold text-black"
                    : "text-muted hover:bg-white/10 hover:text-content"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BackArrow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="back"
      className="inline-flex min-h-14 min-w-14 items-center text-5xl text-muted transition-colors hover:text-content active:text-white"
    >
      <span aria-hidden="true" className="leading-none">←</span>
    </button>
  );
}

/**
 * Stepped post wizard opened from the dock + button: mode → places →
 * timing → note. Single-choice steps advance on tap; the places step
 * continues when both addresses are long enough to geocode; the note
 * step posts. Back arrows walk back. The dock +/X toggle is the ONLY
 * way to close it — backdrop taps and navigation leave it open. A
 * successful post redirects behind it; the user closes via X.
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
  const [step, setStep] = useState(0);
  const [postMode, setPostMode] = useState<"need" | "give" | null>(null);
  const [timing, setTiming] = useState<"asap" | "anytime" | "at" | null>(null);
  // Controlled address fields so they can carry the shared autocomplete.
  // Picks fill the display name; the action geocodes server-side.
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [noteValue, setNoteValue] = useState("");
  // 12-hour clock. Defaults to the current local time rounded up to the
  // next 5 minutes; the hidden ride_time field carries HH:MM 24h for the
  // action (existing contract).
  const now = new Date();
  const [hour, setHour] = useState(() => {
    const h = now.getHours() % 12 || 12;
    return String(h);
  });
  const [minute, setMinute] = useState(() => {
    const m = Math.ceil(now.getMinutes() / 5) * 5;
    return String(m % 60).padStart(2, "0");
  });
  const [ampm, setAmpm] = useState(() => (now.getHours() < 12 ? "am" : "pm"));
  const [clockOpen, setClockOpen] = useState(false);
  const clockBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clockOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!clockBoxRef.current?.contains(e.target as Node))
        setClockOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [clockOpen]);
  const rideTime24 = (() => {
    const h = parseInt(hour, 10) % 12;
    return `${String(ampm === "pm" ? h + 12 : h).padStart(2, "0")}:${minute}`;
  })();
  const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const MINUTES = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, "0"),
  );
  const displayTime = `${hour}:${minute} ${ampm}`;

  const addrPlaceholder =
    postMode === "need"
      ? "complete address is required for accuracy"
      : "city, university or airport";
  const optPlaceholder =
    postMode === "need"
      ? "write something..\n'i have luggage' or\n'need ride for 2 people' or\n'can split gas money' or\n'i will pay $10'"
      : "write something..\n'space available for up to 3 people' or\n'split gas money'";

  const pill = (active: boolean) =>
    `min-h-10 flex-1 rounded-xl border px-2 text-[13px] font-medium transition-colors sm:min-h-11 sm:px-3 sm:text-sm ${
      active
        ? "border-white bg-white text-black"
        : "border-white/20 text-muted hover:border-white/40 hover:text-content active:text-white"
    }`;

  const placesReady =
    fromValue.trim().length >= 5 && toValue.trim().length >= 5;

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
          <div data-quickpost-panel className="relative overscroll-contain rounded-3xl border border-white/15 bg-app/70 p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-6">
            <form action={formAction} className="flex flex-col gap-2 sm:gap-4">
              <h2 className="text-left text-lg font-semibold text-content">
                new post
              </h2>
              <p className="text-center text-[11px] text-muted sm:text-xs">
                your privacy is most important and respected.
              </p>
              <input type="hidden" name="postMode" value={postMode ?? "need"} />
              <input type="hidden" name="timing" value={timing ?? "anytime"} />
              <input type="hidden" name="ride_time" value={rideTime24} />

              {step === 0 ? (
                <div className="flex gap-2" role="group" aria-label="post type">
                  {(["need", "give"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setPostMode(m);
                        setStep(1);
                      }}
                      aria-pressed={postMode === m}
                      className={`${pill(postMode === m)} flex min-h-11 flex-1 items-center justify-center`}
                    >
                      {m === "need" ? "i need ride" : "i give ride"}
                    </button>
                  ))}
                </div>
              ) : null}

              {step === 1 ? (
                <>
                  <fieldset className="rounded-2xl border border-white/15 px-3 pb-1 sm:pb-3">
                    <legend className="px-1 text-[11px] text-muted sm:text-xs">{postMode === "give" ? "from" : "pick up"}</legend>
                    {postMode === "give" ? (
                      <PlaceAutocomplete
                        name="from_address"
                        value={fromValue}
                        onValueChange={setFromValue}
                        required
                        minLength={5}
                        placeholder={addrPlaceholder}
                        ariaLabel="pickup place"
                        kind="all"
                        variant="default"
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
                      />
                    ) : (
                      <input
                        name="from_address"
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        required
                        minLength={5}
                        placeholder={addrPlaceholder}
                        aria-label="pickup address"
                        className="input min-h-[22px] border-0 bg-transparent px-4 text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
                      />
                    )}
                  </fieldset>
                  <fieldset className="rounded-2xl border border-white/15 px-3 pb-1 sm:pb-3">
                    <legend className="px-1 text-[11px] text-muted sm:text-xs">{postMode === "give" ? "to" : "drop off"}</legend>
                    {postMode === "give" ? (
                      <PlaceAutocomplete
                        name="to_address"
                        value={toValue}
                        onValueChange={setToValue}
                        required
                        minLength={5}
                        placeholder={addrPlaceholder}
                        aria-label="drop-off place"
                        kind="all"
                        variant="default"
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
                      />
                    ) : (
                      <input
                        name="to_address"
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        required
                        minLength={5}
                        placeholder={addrPlaceholder}
                        aria-label="drop-off address"
                        className="input min-h-[22px] border-0 bg-transparent px-4 text-center text-[13px] placeholder:truncate placeholder:text-[11px] sm:min-h-11 sm:text-sm sm:placeholder:text-xs"
                      />
                    )}
                  </fieldset>
                  {postMode === "need" ? (
                    <p className="-mt-2 text-center text-[11px] text-muted sm:text-xs">
                      don&apos;t worry, address information is kept private.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => placesReady && setStep(2)}
                    disabled={!placesReady}
                    className="min-h-11 w-full rounded-xl text-sm text-muted hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    continue →
                  </button>
                  <BackArrow onBack={() => setStep(0)} />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="relative" ref={clockBoxRef}>
                    <div className="flex gap-2" role="group" aria-label="timing">
                      {(
                        [
                          ["asap", "now"],
                          ["anytime", "anytime"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setTiming(value);
                            setClockOpen(false);
                            setStep(3);
                          }}
                          aria-pressed={timing === value}
                          className={`${pill(timing === value)} flex min-h-10 flex-1 items-center justify-center sm:min-h-11`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        key="at"
                        type="button"
                        onClick={() => {
                          setTiming("at");
                          setClockOpen((v) => (timing === "at" ? !v : true));
                        }}
                        aria-pressed={timing === "at"}
                        aria-expanded={timing === "at" && clockOpen}
                        className={`${pill(timing === "at")} flex min-h-10 flex-1 items-center justify-center sm:min-h-11`}
                      >
                        {timing === "at" ? displayTime : "enter time"}
                      </button>
                    </div>
                    {timing === "at" && clockOpen ? (
                      <div className="thin-scrollbar absolute right-0 top-full z-50 mt-1 flex max-h-60 w-3/4 gap-2 overflow-hidden overscroll-contain rounded-xl border border-white/25 bg-app/60 p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl backdrop-saturate-150">
                        {(
                          [
                            ["hour", HOURS, hour, setHour],
                            ["minute", MINUTES, minute, setMinute],
                          ] as const
                        ).map(([label, opts, current, set]) => (
                          <LoopColumn
                            key={label}
                            label={label}
                            options={[...opts]}
                            value={current}
                            onPick={set}
                          />
                        ))}
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                          <p aria-hidden="true" className="shrink-0 select-none pb-1 text-center text-[11px]">
                            &nbsp;
                          </p>
                          <div className="flex flex-col gap-1">
                            {(["am", "pm"] as const).map((o) => (
                              <button
                                key={o}
                                type="button"
                                role="option"
                                aria-selected={o === ampm}
                                onClick={() => {
                                  setAmpm(o);
                                  setClockOpen(false);
                                  setStep(3);
                                }}
                                className={`min-h-10 shrink-0 rounded-lg text-sm ${
                                  o === ampm
                                    ? "bg-white font-semibold text-black"
                                    : "text-muted hover:bg-white/10 hover:text-content"
                                }`}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <BackArrow onBack={() => setStep(1)} />
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <fieldset className="rounded-2xl border border-white/15 px-3 pb-0.5 sm:pb-3">
                    <legend className="px-1 text-[11px] text-muted sm:text-xs">note (optional)</legend>
                    <textarea
                      name="description"
                      rows={postMode === "need" ? 5 : 3}
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
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

                  <PostButton skippable={noteValue.trim().length === 0} />
                  <BackArrow onBack={() => setStep(2)} />
                </>
              ) : null}
            </form>
          </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
