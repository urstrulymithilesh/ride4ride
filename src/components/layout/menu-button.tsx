"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { PersonGlyph } from "@/components/places/search-icons";

/** Dock menu trigger. Always the person glyph — opening the drawer
 *  never swaps it (the drawer carries its own close X). */
function HamburgerIcon() {
  return <PersonGlyph height={18} />;
}

/**
 * Hamburger toggle + dropdown panel. Panel content (links, identity,
 * logout form) is server-rendered and passed in as children.
 */
export function MenuButton({
  children,
  tone = "text-content",
}: {
  children: React.ReactNode;
  /** Trigger glyph color while the drawer is closed. Opens bright. */
  tone?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation (covers link taps, back/forward gestures).
  // Render-time adjustment, not an effect: setting state during render
  // for this compare-and-reset is the sanctioned pattern and avoids a
  // cascading render.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Portal out of the top bar: its backdrop-blur makes it a containing
  // block for fixed descendants, so the drawer and scrim would size
  // themselves to the 52px bar instead of the viewport. Mounts
  // post-hydration (microtask, not a sync setState) so SSR stays clean.
  const [mounted, setMounted] = useState(false);
  // Swipe-to-close: a predominantly-horizontal left swipe on the panel
  // dismisses the drawer (scrim tap and the header X keep working).
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => {
      if (live) setMounted(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const button = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Menu"
      aria-expanded={open}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full ${open ? "text-white" : tone}`}
    >
      <HamburgerIcon />
    </button>
  );

  if (!mounted) return button;

  return (
    <>
      {button}
      {open
        ? createPortal(
            <>
              {/* Scrim dims + blurs the feed behind the drawer. */}
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-50 cursor-default bg-transparent"
              />
              {/* Full-height left drawer, rounded on the right edge only.
                  Anchored to the app column (centered 480px), not the
                  viewport: on wide screens viewport-left would strand it
                  outside the page. */}
              <div className="pointer-events-none fixed inset-y-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2">
                <div
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    swipeFrom.current = { x: t.clientX, y: t.clientY };
                  }}
                  onTouchEnd={(e) => {
                    const from = swipeFrom.current;
                    swipeFrom.current = null;
                    if (!from) return;
                    const t = e.changedTouches[0];
                    const dx = t.clientX - from.x;
                    const dy = t.clientY - from.y;
                    if (dx < -60 && Math.abs(dx) > 2 * Math.abs(dy)) {
                      setOpen(false);
                    }
                  }}
                  className="pointer-events-auto flex h-full w-80 flex-col rounded-r-2xl border-r border-hairline bg-app/90 backdrop-blur-2xl backdrop-saturate-150 animate-drawer-in"
                >
                  {/* X mirrors the hamburger seat on the right edge:
                      same bar height, padding, button and glyph size. */}
                  <div className="flex h-16 shrink-0 items-center justify-end pr-5">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-content"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12" />
                        <path d="M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
