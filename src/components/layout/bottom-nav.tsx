"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function CarIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <path d="M3 11h18a1 1 0 0 1 1 1v4h-2.5" />
      <path d="M3 12v4h2.5" />
      <circle cx="7.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
      <path d="M8.5 12h.01" strokeWidth="2.5" />
      <path d="M12 12h.01" strokeWidth="2.5" />
      <path d="M15.5 12h.01" strokeWidth="2.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="26"
      height="26"
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

interface Active {
  rides: boolean;
  post: boolean;
  chats: boolean;
}

const NONE: Active = { rides: false, post: false, chats: false };

function BottomNavLinks({ active }: { active: Active }) {
  const item = (isActive: boolean) =>
    `flex min-h-11 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium ${
      isActive ? "text-primary" : "text-muted"
    }`;

  return (
    <nav
      aria-label="Ride navigation"
      className="flex min-h-[64px] items-center justify-between"
    >
      <Link
        href="/rides"
        aria-current={active.rides ? "page" : undefined}
        className={item(active.rides)}
      >
        <CarIcon />
        Rides
      </Link>
      <Link
        href="/rides/new"
        aria-label="Post a ride"
        aria-current={active.post ? "page" : undefined}
        className="flex flex-1 flex-col items-center justify-center gap-0.5"
      >
        <span
          className={`flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)] ${
            active.post ? "bg-content" : "bg-primary"
          }`}
        >
          <PlusIcon />
        </span>
        <span
          className={`-mt-3 text-[11px] font-medium ${
            active.post ? "text-content" : "text-muted"
          }`}
        >
          Post
        </span>
      </Link>
      <Link
        href="/messages"
        aria-current={active.chats ? "page" : undefined}
        className={item(active.chats)}
      >
        <ChatIcon />
        Chats
      </Link>
    </nav>
  );
}

function BottomNavInner() {
  const pathname = usePathname();

  // The chat thread has its own sticky bottom composer — stay out of its
  // way there. The chat list has no bottom bar, so the nav stays visible.
  if (pathname.startsWith("/messages/")) {
    return null;
  }

  const active: Active = {
    rides: pathname === "/rides",
    post:
      pathname === "/rides/new" ||
      pathname === "/rides/offer" ||
      pathname === "/rides/get",
    chats: pathname === "/messages",
  };

  return <BottomNavLinks active={active} />;
}

/**
 * Phone-app bottom tab bar. Fixed within the 480px app column so the
 * center + button is always reachable. Hidden on chat pages, which have
 * their own sticky bottom input.
 */
export function BottomNav() {
  return (
    <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-hairline bg-app/95 backdrop-blur">
      <div className="safe-bottom px-6 pb-2 pt-1">
        <Suspense fallback={<BottomNavLinks active={NONE} />}>
          <BottomNavInner />
        </Suspense>
      </div>
    </div>
  );
}
