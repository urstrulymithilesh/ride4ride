"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M3 7h18" />
          <path d="M3 12h18" />
          <path d="M3 17h18" />
        </>
      )}
    </svg>
  );
}

/**
 * Hamburger toggle + dropdown panel. Panel content (links, identity,
 * logout form) is server-rendered and passed in as children.
 */
export function MenuButton({ children }: { children: React.ReactNode }) {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="menu"
        aria-expanded={open}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-content"
      >
        <HamburgerIcon open={open} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 cursor-default"
          />
          <div className="absolute left-0 top-12">{children}</div>
        </>
      ) : null}
    </>
  );
}
