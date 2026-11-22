"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { submitQuickPost } from "@/app/rides/actions";
import { PlaceAutocomplete } from "@/components/places/place-autocomplete";
import { addDays } from "@/lib/pickup-tz";

/**
 * Post draft: everything the wizard holds, so a signed-out submit can
 * stash it locally, survive the sign-in bounce, and reopen at confirm.
 */
export interface PostDraft {
  postMode: "need" | "give";
  fromValue: string;
  toValue: string;
  noteValue: string;
  dateOption: "today" | "tomorrow" | "custom";
  customDate: string;
  timing: "asap" | "anytime" | "at";
  hour: string;
  minute: string;
  ampm: "am" | "pm";
}

export const POST_DRAFT_KEY = "r4r-post-draft";

/** Device-local YYYY-MM-DD (display use only; the server resolves dates). */
function deviceToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function PostButton({ skippable }: { skippable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-xl bg-white text-[15px] font-semibold text-black transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-12 sm:text-base"
    >
      {pending ? "Posting…" : skippable ? "Skip & post" : "Post"}
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
                className={`min-h-10 shrink-0 rounded-lg text-sm transition-[transform,background-color,color] duration-150 active:scale-[0.97] ${
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
      aria-label="Back"
      className="inline-flex min-h-11 min-w-11 items-center text-5xl text-muted transition-[transform,color] duration-150 hover:text-content active:scale-95 active:text-white"
    >
      <span aria-hidden="true" className="leading-none">←</span>
    </button>
  );
}

/** Full USPS street-suffix map (lowercase key → postal abbreviation). */
const STREET_SUFFIX_ABBR: Record<string, string> = {
  alley: "Aly",
  annex: "Anx",
  arcade: "Arc",
  avenue: "Ave",
  bayou: "Byu",
  beach: "Bch",
  bend: "Bnd",
  bluff: "Blf",
  bluffs: "Blfs",
  bottom: "Btm",
  boulevard: "Blvd",
  branch: "Br",
  bridge: "Brg",
  brook: "Brk",
  brooks: "Brks",
  burg: "Bg",
  burgs: "Bgs",
  bypass: "Byp",
  camp: "Cp",
  canyon: "Cyn",
  cape: "Cpe",
  causeway: "Cswy",
  center: "Ctr",
  centers: "Ctrs",
  circle: "Cir",
  circles: "Cirs",
  cliff: "Clf",
  cliffs: "Clfs",
  club: "Clb",
  common: "Cmn",
  commons: "Cmns",
  corner: "Cor",
  corners: "Cors",
  course: "Crse",
  court: "Ct",
  courts: "Cts",
  cove: "Cv",
  coves: "Cvs",
  creek: "Crk",
  crescent: "Cres",
  crest: "Crst",
  crossing: "Xing",
  crossroad: "Xrd",
  crossroads: "Xrds",
  curve: "Curv",
  dale: "Dl",
  dam: "Dm",
  divide: "Dv",
  drive: "Dr",
  drives: "Drs",
  estate: "Est",
  estates: "Ests",
  expressway: "Expy",
  extension: "Ext",
  extensions: "Exts",
  fall: "Fall",
  falls: "Fls",
  ferry: "Fry",
  field: "Fld",
  fields: "Flds",
  flat: "Flt",
  flats: "Flts",
  ford: "Frd",
  fords: "Frds",
  forest: "Frst",
  forge: "Frg",
  forges: "Frgs",
  fork: "Frk",
  forks: "Frks",
  fort: "Ft",
  freeway: "Fwy",
  garden: "Gdn",
  gardens: "Gdns",
  gateway: "Gtwy",
  glen: "Gln",
  glens: "Glns",
  green: "Grn",
  greens: "Grns",
  grove: "Grv",
  groves: "Grvs",
  harbor: "Hbr",
  harbors: "Hbrs",
  haven: "Hvn",
  heights: "Hts",
  highway: "Hwy",
  hill: "Hl",
  hills: "Hls",
  hollow: "Holw",
  inlet: "Inlt",
  island: "Is",
  islands: "Iss",
  isle: "Isle",
  junction: "Jct",
  junctions: "Jcts",
  key: "Ky",
  keys: "Kys",
  knoll: "Knl",
  knolls: "Knls",
  lake: "Lk",
  lakes: "Lks",
  land: "Land",
  lane: "Ln",
  light: "Lgt",
  lights: "Lgts",
  loaf: "Lf",
  lock: "Lck",
  locks: "Lcks",
  lodge: "Ldg",
  loop: "Loop",
  mall: "Mall",
  manor: "Mnr",
  manors: "Mnrs",
  meadow: "Mdw",
  meadows: "Mdws",
  mews: "Mews",
  mill: "Ml",
  mills: "Mls",
  mission: "Msn",
  motorway: "Mtwy",
  mount: "Mt",
  mountain: "Mtn",
  mountains: "Mtns",
  neck: "Nck",
  orchard: "Orch",
  oval: "Ovl",
  overpass: "Opas",
  park: "Park",
  parks: "Park",
  parkway: "Pkwy",
  parkways: "Pkwy",
  pass: "Pass",
  passage: "Psge",
  path: "Path",
  pike: "Pike",
  pine: "Pne",
  pines: "Pnes",
  place: "Pl",
  plain: "Pln",
  plains: "Plns",
  plaza: "Plz",
  point: "Pt",
  points: "Pts",
  port: "Prt",
  ports: "Prts",
  prairie: "Pr",
  radial: "Radl",
  ramp: "Ramp",
  ranch: "Rnch",
  rapid: "Rpds",
  rapids: "Rpds",
  rest: "Rst",
  ridge: "Rdg",
  ridges: "Rdgs",
  river: "Riv",
  road: "Rd",
  roads: "Rds",
  route: "Rte",
  row: "Row",
  rue: "Rue",
  run: "Run",
  shoal: "Shl",
  shoals: "Shls",
  shore: "Shr",
  shores: "Shrs",
  skyway: "Skwy",
  spring: "Spg",
  springs: "Spgs",
  spur: "Spur",
  spurs: "Spur",
  square: "Sq",
  squares: "Sqs",
  stravenue: "Stra",
  stream: "Strm",
  street: "St",
  streets: "Sts",
  summit: "Smt",
  terrace: "Ter",
  throughway: "Trwy",
  trace: "Trce",
  track: "Trak",
  trafficway: "Trfy",
  trail: "Trl",
  trailer: "Trlr",
  tunnel: "Tunl",
  turnpike: "Tpke",
  underpass: "Upas",
  union: "Un",
  unions: "Uns",
  valley: "Vly",
  valleys: "Vlys",
  viaduct: "Via",
  view: "Vw",
  views: "Vws",
  village: "Vlg",
  villages: "Vlgs",
  ville: "Vl",
  vista: "Vis",
  walk: "Walk",
  walks: "Walk",
  wall: "Wall",
  way: "Way",
  ways: "Ways",
  well: "Wl",
  wells: "Wls",
};

// Longest-first so plurals match before singulars ("streets" → "Sts",
// not "street" → "St" leaving a stray "s").
const STREET_SUFFIX_RE = new RegExp(
  `\\b(${Object.keys(STREET_SUFFIX_ABBR).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "gi",
);

/** Shorten every whole-word street suffix in one pass (USPS postal set). */
function abbrStreet(street: string): string {
  return street.replace(
    STREET_SUFFIX_RE,
    (m) => STREET_SUFFIX_ABBR[m.toLowerCase()] ?? m,
  );
}

function shortAddress(addr: string): string {
  const parts = addr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return abbrStreet(parts[0]);
  return `${abbrStreet(parts[0])}, ${parts[1]}`;
}

/**
 * Stepped post wizard opened from the dock + button: mode → places →
 * timing → note. Single-choice steps advance on tap; the places step
 * continues when both addresses are long enough to geocode; the note
 * step posts. Back arrows walk back. The dock +/X toggle is the ONLY
 * way to close it — backdrop taps and navigation leave it open. A
 * successful post redirects behind it; the user closes via X.
 */
export function QuickPost({
  initialDraft = null,
  onDone = null,
}: {
  initialDraft?: PostDraft | null;
  /** Called after a successful post instead of navigating away, so the
   *  host (the dock) can simply close the popup. */
  onDone?: (() => void) | null;
}) {
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
  const [step, setStep] = useState(initialDraft ? 4 : 0);
  const [postMode, setPostMode] = useState<"need" | "give" | null>(
    initialDraft?.postMode ?? null,
  );
  const [timing, setTiming] = useState<"asap" | "anytime" | "at" | null>(
    initialDraft?.timing ?? null,
  );
  // Controlled address fields so they can carry the shared autocomplete.
  // Address picks fill the complete address; the action geocodes it.
  const [fromValue, setFromValue] = useState(initialDraft?.fromValue ?? "");
  const [toValue, setToValue] = useState(initialDraft?.toValue ?? "");
  const [noteValue, setNoteValue] = useState(initialDraft?.noteValue ?? "");
  // Ride day: Today / Tomorrow / explicit date (day-after-tomorrow on).
  const [dateOption, setDateOption] = useState<
    "today" | "tomorrow" | "custom"
  >(initialDraft?.dateOption ?? "today");
  const [customDate, setCustomDate] = useState(initialDraft?.customDate ?? "");
  // Tracks a submitted form so the action outcome (success navigation or
  // terminal error) can clear the saved draft exactly once. A ref, not
  // state: flipping state here would cascade renders.
  const submittedRef = useRef(false);
  // 12-hour clock. Defaults to the current local time rounded up to the
  // next 5 minutes; the hidden ride_time field carries HH:MM 24h for the
  // action (existing contract).
  const now = new Date();
  const [hour, setHour] = useState(() => {
    if (initialDraft) return initialDraft.hour;
    const h = now.getHours() % 12 || 12;
    return String(h);
  });
  const [minute, setMinute] = useState(() => {
    if (initialDraft) return initialDraft.minute;
    const m = Math.ceil(now.getMinutes() / 5) * 5;
    return String(m % 60).padStart(2, "0");
  });
  const [ampm, setAmpm] = useState(() =>
    initialDraft ? initialDraft.ampm : now.getHours() < 12 ? "am" : "pm",
  );
  const [clockOpen, setClockOpen] = useState(false);
  const clockBoxRef = useRef<HTMLDivElement>(null);
  // Note box auto-grows with its content — no internal scrolling.
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const autosizeNote = () => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (step === 4) autosizeNote();
  }, [step]);  useEffect(() => {
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

  const saveDraft = () => {
    if (!postMode) return;
    const draft: PostDraft = {
      postMode,
      fromValue,
      toValue,
      noteValue,
      dateOption,
      customDate,
      timing: timing ?? "anytime",
      hour,
      minute,
      ampm,
    };
    try {
      localStorage.setItem(POST_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Private mode etc: the post still submits, just without restore.
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(POST_DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  // While the post popup is open the feed chrome stands down: the
  // filter chips and the recenter control hide, and return on close.
  // Mount/unmount maps exactly to open/close (the dock renders this only
  // when postOpen), so no event contract is needed.
  useEffect(() => {
    const els = [...document.querySelectorAll("[data-feed-search],[data-recenter]")];
    const prev = els.map((el) => (el as HTMLElement).style.display);
    els.forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
    return () => {
      els.forEach((el, i) => {
        (el as HTMLElement).style.display = prev[i] ?? "";
      });
    };
  }, []);

  // Action outcome: success clears the draft and hands control back
  // (the detail page is gone pending redesign, so there is nowhere to
  // navigate — the popup simply closes). A terminal error also clears
  // the draft so it can't reopen stale. A signed-out submit redirects
  // server-side with no state update, so the saved draft survives for
  // the post-login restore.
  useEffect(() => {
    if (!submittedRef.current) return;
    submittedRef.current = false;
    if (state.ok && state.rideId) {
      clearDraft();
      onDone?.();
    } else if (state.error || state.fieldErrors) {
      clearDraft();
    }
  }, [state, onDone]);

  const addrPlaceholder =
    postMode === "need"
      ? "Complete address is required for accuracy"
      : "City, University or Airport";
  const optPlaceholder =
    postMode === "need"
      ? "Write something..\n'I have luggage' or 'Need 2 seats'"
      : "Write something..\n'Space for 3' or 'Leaving on time'";

  const pill = (active: boolean) =>
    `min-h-10 flex-1 rounded-xl border px-2 text-[13px] font-medium transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] sm:min-h-11 sm:px-3 sm:text-sm ${
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
      <div className="pointer-events-auto absolute inset-0 overflow-y-auto px-4 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
        <div className="flex min-h-full">
          <div className="m-auto w-full max-w-[340px] sm:max-w-sm">
            <div data-quickpost-panel className="animate-panel-in glass-dark relative overscroll-contain rounded-3xl border border-white/15 p-3 opacity-90 sm:p-6">
            <form
              action={formAction}
              onSubmit={() => {
                submittedRef.current = true;
                saveDraft();
              }}
              className="flex flex-col gap-2 sm:gap-4"
            >
              <div className="flex items-center gap-1">
                {step > 0 ? (
                  <BackArrow onBack={() => setStep(step - 1)} />
                ) : null}
                <h2 className="text-left text-lg font-semibold text-content">
                  New post
                </h2>
              </div>
              <input type="hidden" name="postMode" value={postMode ?? "need"} />
              <input type="hidden" name="timing" value={timing ?? "anytime"} />
              <input type="hidden" name="ride_time" value={rideTime24} />
              <input type="hidden" name="date_option" value={dateOption} />
              <input
                type="hidden"
                name="custom_date"
                value={dateOption === "custom" ? customDate : ""}
              />
              {/* Step-1 address fields unmount once you advance, so carry
                  their controlled values here — otherwise the submit sees
                  empty from/to and wrongly reports "enter a full pickup
                  address" no matter what was typed. */}
              {step !== 1 ? (
                <>
                  <input type="hidden" name="from_address" value={fromValue} />
                  <input type="hidden" name="to_address" value={toValue} />
                </>
              ) : null}

              {step === 0 ? (
                <div className="flex gap-2" role="group" aria-label="Post type">
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
                      {m === "need" ? "I need ride" : "I give ride"}
                    </button>
                  ))}
                </div>
              ) : null}

              {step === 1 ? (
                <>
                  <fieldset className="rounded-lg border border-white/15 px-3 pb-0.5 sm:pb-1.5">
                    <legend className="px-1 text-[8px] text-muted">{postMode === "give" ? "From" : "Pick up"}</legend>
                    {postMode === "give" ? (
                      <PlaceAutocomplete
                        name="from_address"
                        value={fromValue}
                        onValueChange={setFromValue}
                        required
                        minLength={5}
                        listGapClassName="mt-1"
                        placeholder={addrPlaceholder}
                        ariaLabel="Pickup place"
                        kind="all"
                        variant="default"
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-base placeholder:truncate placeholder:text-[11px] sm:placeholder:text-xs"
                      />
                    ) : (
                      <PlaceAutocomplete
                        name="from_address"
                        value={fromValue}
                        onValueChange={setFromValue}
                        required
                        minLength={5}
                        listGapClassName="mt-1"
                        placeholder={addrPlaceholder}
                        ariaLabel="Pickup address"
                        source="address"
                        nearViewer
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-base placeholder:truncate placeholder:text-[11px] sm:placeholder:text-xs"
                      />
                    )}
                  </fieldset>
                  <p className="my-1 text-center text-[11px] text-muted sm:text-xs">
                    Don&apos;t worry, address information is kept private.
                  </p>
                  <fieldset className="rounded-lg border border-white/15 px-3 pb-0.5 sm:pb-1.5">
                    <legend className="px-1 text-[8px] text-muted">{postMode === "give" ? "To" : "Drop off"}</legend>
                    {postMode === "give" ? (
                      <PlaceAutocomplete
                        name="to_address"
                        value={toValue}
                        onValueChange={setToValue}
                        required
                        minLength={5}
                        listGapClassName="mt-1"
                        placeholder={addrPlaceholder}
                        ariaLabel="Drop-off place"
                        kind="all"
                        variant="default"
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-base placeholder:truncate placeholder:text-[11px] sm:placeholder:text-xs"
                      />
                    ) : (
                      <PlaceAutocomplete
                        name="to_address"
                        value={toValue}
                        onValueChange={setToValue}
                        required
                        minLength={5}
                        listGapClassName="mt-1"
                        placeholder={addrPlaceholder}
                        ariaLabel="Drop-off address"
                        source="address"
                        inputClassName="input min-h-[22px] border-0 bg-transparent px-4 text-center text-base placeholder:truncate placeholder:text-[11px] sm:placeholder:text-xs"
                      />
                    )}
                  </fieldset>
                  <button
                    type="button"
                    onClick={() => placesReady && setStep(2)}
                    disabled={!placesReady}
                    className="min-h-11 w-full rounded-xl text-sm text-muted transition-[transform,color,opacity] duration-150 hover:text-content active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue →
                  </button>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div
                    className="flex gap-2"
                    role="group"
                    aria-label="Ride date"
                  >
                    {(
                      ["today", "tomorrow", "custom"] as const
                    ).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => {
                          setDateOption(o);
                          // "now" only exists for today — leaving it would
                          // submit an impossible combo.
                          if (o !== "today")
                            setTiming((t) => (t === "asap" ? null : t));
                          if (o !== "custom") setStep(3);
                        }}
                        aria-pressed={dateOption === o}
                        className={`${pill(dateOption === o)} flex min-h-10 flex-1 items-center justify-center sm:min-h-11`}
                      >
                        {o === "today"
                          ? "Today"
                          : o === "tomorrow"
                            ? "Tomorrow"
                            : "Set date"}
                      </button>
                    ))}
                  </div>
                  {dateOption === "custom" ? (
                    <>
                      <input
                        type="date"
                        required
                        value={customDate}
                        min={addDays(deviceToday(), 2)}
                        onChange={(e) => setCustomDate(e.target.value)}
                        aria-label="Pick a date"
                        className="input min-h-11 w-full text-center [color-scheme:dark]"
                      />
                      <button
                        type="button"
                        onClick={() => customDate && setStep(3)}
                        disabled={!customDate}
                        className="min-h-11 w-full rounded-xl text-sm text-muted transition-[transform,color,opacity] duration-150 hover:text-content active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Continue →
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="relative" ref={clockBoxRef}>
                    <div
                      className="flex gap-2"
                      role="group"
                      aria-label="Timing"
                    >
                      {(
                        [
                          ...(dateOption === "today"
                            ? [["asap", "Now"] as const]
                            : []),
                          ["anytime", "Anytime"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setTiming(value);
                            setClockOpen(false);
                            setStep(4);
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
                        {timing === "at" ? displayTime : "Enter time"}
                      </button>
                    </div>
                    {timing === "at" && clockOpen ? (
                      <div className="animate-popover-in thin-scrollbar absolute right-0 top-full z-50 mt-1 flex max-h-60 w-3/4 gap-2 overflow-hidden overscroll-contain rounded-xl border border-white/25 bg-app/60 p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl backdrop-saturate-150">
                        {(
                          [
                            ["Hour", HOURS, hour, setHour],
                            ["Minute", MINUTES, minute, setMinute],
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
                                  setStep(4);
                                }}
                                className={`min-h-10 shrink-0 rounded-lg text-sm transition-[transform,background-color,color] duration-150 active:scale-[0.97] ${
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
                  <PostButton skippable={noteValue.trim().length === 0} />
                </>
              ) : null}

              {step === 4 ? (
                <>
                  {/* Confirm summary: what is being posted, in one glance. */}
                  <div
                    title={`${fromValue} → ${toValue}`}
                    className="rounded-2xl border border-white/15 bg-black/60 px-3 py-2 text-left text-[13px]"
                  >
                    <p>
                      <span
                        className={
                          postMode === "give"
                            ? "font-semibold text-content"
                            : "font-semibold text-[#34c759]"
                        }
                      >
                        {postMode === "give" ? "Ride Available" : "Need Ride"}
                      </span>{" "}
                      <span className="text-white">
                        ·{" "}
                        {dateOption === "today"
                          ? "Today"
                          : dateOption === "tomorrow"
                            ? "Tomorrow"
                            : customDate || "Pick a date"}{" "}
                        ·{" "}
                        {timing === "at"
                          ? displayTime
                          : timing === "asap"
                            ? "Now"
                            : "Anytime"}
                      </span>
                    </p>
                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[10px] text-muted">
                      <span className="text-right">Pick Up :</span>
                      <span className="wrap-anywhere">{shortAddress(fromValue) || "…"}</span>
                      <span className="text-right">Drop Off :</span>
                      <span className="wrap-anywhere">{shortAddress(toValue) || "…"}</span>
                    </div>
                  </div>
                  <fieldset className="rounded-2xl border border-white/15 px-3 pb-0.5 sm:pb-3">
                    <legend className="px-1 text-[11px] text-muted sm:text-xs">Note (optional)</legend>
                    <textarea
                      name="description"
                      ref={noteRef}
                      rows={postMode === "need" ? 2 : 1}
                      value={noteValue}
                      onChange={(e) => {
                        setNoteValue(e.target.value);
                        const el = e.target;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      placeholder={optPlaceholder}
                      aria-label="Optional details"
                      enterKeyHint="done"
                      className="input no-scrollbar resize-none overflow-hidden border-0 bg-transparent py-1 text-left text-base leading-relaxed placeholder:text-left placeholder:text-[11px] sm:py-2 sm:placeholder:text-xs"
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
