"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { QuickPost, POST_DRAFT_KEY } from "@/components/rides/quick-post";
import type { PostDraft } from "@/components/rides/quick-post";
import { OPEN_POST_EVENT } from "@/components/rides/empty-post-cta";
import { useViewerLocation } from "@/components/location/location-context";
import { CAR_GLYPH_PATH } from "@/lib/marker-art";
import { HailPersonIcon } from "@/components/places/search-icons";

function SmileyCarIcon() {
  return (
    <svg
      width="28"
      height="20"
      viewBox="113 26 593 424"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={CAR_GLYPH_PATH}
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L4 20.5V6z" />
      <path d="M8 8.5h8" />
      <path d="M8 12h5" />
    </svg>
  );
}

/**
 * Feed-only dock: one glass bar with hail | car | + | chats | menu.
 * The + straddles the top edge. The menu slot reuses the same drawer
 * trigger as the top bar (passed in as `menu`). Tabs preserve every
 * other search param (mirroring the page's hrefWith defaults), so
 * switching type never clears filters.
 */
function FeedDock({ menu }: { menu: React.ReactNode }) {
  const { coords } = useViewerLocation();
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Feed-only auto-refresh, aligned to the wall clock (:00 and :30 of
  // every minute — 2,880 refreshes a day). The camera stash keeps the
  // refresh from yanking the viewport (see RidesMap landing); the stash
  // is dropped on tab switch so each tab keeps its own landing view.
  useEffect(() => {
    if (pathname !== "/" && pathname !== "/rides") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(
        () => {
          try {
            const w = window as unknown as {
              __r4rMap?: {
                getCenter: () => { toArray: () => [number, number] };
                getZoom: () => number;
              };
              __r4rViewport?: {
                center: [number, number];
                zoom: number;
                at: number;
              };
            };
            const m = w.__r4rMap;
            if (m)
              w.__r4rViewport = {
                center: m.getCenter().toArray(),
                zoom: m.getZoom(),
                at: Date.now(),
              };
          } catch {
            // Map not ready — refresh anyway.
          }
          router.refresh();
          schedule();
        },
        30000 - (Date.now() % 30000),
      );
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
      try {
        delete (window as unknown as { __r4rViewport?: unknown })
          .__r4rViewport;
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Post-login draft restore: a signed-out submit saves the draft and
  // bounces through sign-in; landing back here reopens the popup at the
  // confirm step. Reads storage in a post-hydration microtask — the draft
  // exists only client-side, so render-time reads desync the server HTML
  // and leave attributes React won't patch. Clearing (X, success,
  // terminal error) removes it.
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => {
      if (!live) return;
      try {
        const raw = localStorage.getItem(POST_DRAFT_KEY);
        if (raw) {
          setPostDraft(JSON.parse(raw) as PostDraft);
          setPostOpen(true);
        }
      } catch {
        // Corrupt draft: drop it rather than crash the dock.
        try {
          localStorage.removeItem(POST_DRAFT_KEY);
        } catch {
          // ignore
        }
      }
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  const closePost = () => {
    try {
      localStorage.removeItem(POST_DRAFT_KEY);
    } catch {
      // ignore
    }
    setPostDraft(null);
    setPostOpen(false);
  };

  // The empty-feed "be the first to post one" button lives in a server
  // component, so it can't flip this state directly — it fires an event
  // and the dock opens the popup in place. setState runs in the event
  // callback, not the effect body.
  useEffect(() => {
    const open = () => setPostOpen(true);
    window.addEventListener(OPEN_POST_EVENT, open);
    return () => window.removeEventListener(OPEN_POST_EVENT, open);
  }, []);

  // The tab IS the route: hail lives at /, cars at /rides. Filters carry
  // over; the dead ?type= scheme is stripped, never written.
  const isOffer = pathname === "/rides";
  // On the messages page neither ride tab is active — chats is.
  const isMessages = pathname === "/chat";
  const tab = (value: "get" | "offer", label: React.ReactNode, name: string) => {
    const isActive = !isMessages && (value === "offer") === isOffer;
    const params = new URLSearchParams(sp.toString());
    // Auth-flow and legacy params must not leak into feed links when the
    // dock renders off-feed (sign-in carries ?redirectTo=).
    params.delete("redirectTo");
    params.delete("type");
    const qs = params.toString();
    const href = value === "offer" ? "/rides" : "/";
    return (
      <Link
        href={qs ? `${href}?${qs}` : href}
        aria-current={isActive ? "page" : undefined}
        aria-label={name}
        className={`flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] ${
          isActive ? "text-white" : "text-white/40 hover:text-content"
        }`}
      >
        <span
          className={`flex transition-transform duration-200 ${isActive ? "scale-110" : "scale-90"}`}
        >
          {label}
        </span>
      </Link>
    );
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[var(--z-chrome)] mx-auto w-full max-w-[480px] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {(pathname === "/rides" || pathname === "/") ? (
          <span
            data-recenter
            style={{ top: "-70px" }}
            className="absolute right-[32px] z-[var(--z-chat)] flex h-[38px] w-[38px] items-center justify-center"
          >
            <button
              type="button"
              onClick={() => {
              const map = (
                window as unknown as {
                  __r4rMap?: {
                    flyTo: (opts: {
                      center: [number, number];
                      zoom: number;
                      essential: boolean;
                    }) => void;
                  };
                }
              ).__r4rMap;
              if (!coords || !map) return;
              const raw = getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--r4r-min-zoom");
              const n = parseFloat(raw);
              map.flyTo({
                center: [coords.lng, coords.lat],
                zoom: Number.isFinite(n) ? n : 10,
                essential: true,
              });
            }}
            aria-label="recenter map on my location"
            className="glass-dark flex h-[38px] w-[38px] items-center justify-center rounded-full text-white opacity-90"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20.2 2.8Q21.5 2.3 21 3.6L12.9 20.6Q12.4 21.4 12 20.6V12.4Q12 11.9 11.5 11.9H3.4Q2.6 11.9 2.6 11.1V10.9Q2.6 10.4 3.2 10.2Z" transform="translate(-0.05 0.55)" />
            </svg>
            </button>
          </span>
        ) : null}
        <nav
          aria-label="ride type"
          className="glass-dark relative flex items-center justify-between rounded-[var(--bar-radius)] px-2 py-1.5 opacity-90"
        >
          {tab("get", <HailPersonIcon />, "need ride")}
          {tab("offer", <SmileyCarIcon />, "ride available")}
          <span className="flex min-h-10 flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => (postOpen ? closePost() : setPostOpen(true))}
              aria-label={postOpen ? "close" : "post a ride"}
              aria-expanded={postOpen}
              aria-haspopup="dialog"
              // Absolute against the nav: bottom edge sits exactly on the
              // dock's bottom edge, top straddles above it. The empty
              // span reserves the middle slot's width.
              className="r4r-plus-pulse absolute bottom-[2px] left-1/2 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center rounded-full bg-primary text-black shadow-[0_8px_24px_-6px_rgba(0,0,0,0.45)]"
            >
              <span
                aria-hidden="true"
                className={`flex transition-transform duration-200 ${postOpen ? "rotate-45" : ""}`}
              >
                <PlusIcon />
              </span>
            </button>
          </span>
          <Link
            href="/chat"
            aria-label="chats"
            aria-current={isMessages ? "page" : undefined}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-full ${
              isMessages ? "text-white" : "text-white/40 hover:text-content"
            }`}
          >
            <span
              className={`flex transition-transform duration-200 active:scale-110 ${
                isMessages ? "scale-110" : "scale-90"
              }`}
            >
              <ChatIcon />
            </span>
          </Link>
          <span className="group flex min-h-10 min-w-0 flex-1 items-center justify-center text-white/40 transition-colors hover:text-white">
            <span className="flex scale-90 transition-transform duration-200 active:scale-110">
              {menu}
            </span>
          </span>
        </nav>
      </div>
      {postOpen ? (
        <QuickPost
          key={postDraft ? "draft" : "new"}
          initialDraft={postDraft}
          onDone={closePost}
        />
      ) : null}
    </>
  );
}

function BottomNavInner({ menu }: { menu: React.ReactNode }) {
  const pathname = usePathname();

  // The chat thread has its own sticky bottom composer — stay out of its
  // way there. Everywhere else the phone chrome is the one glass bar:
  // hail | car | + | chats | menu.
  if (pathname.startsWith("/chat/")) {
    return null;
  }

  return <FeedDock menu={menu} />;
}

/**
 * Phone-app bottom chrome. One glass bar everywhere — hail | car | + |
 * chats | menu — with the + straddling the top edge. Hidden on chat
 * thread pages, which have their own sticky input.
 */
export function BottomNav({ menu }: { menu: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <BottomNavInner menu={menu} />
    </Suspense>
  );
}
