"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

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

interface Active {
  rides: boolean;
  post: boolean;
  chats: boolean;
}

const NONE: Active = { rides: false, post: false, chats: false };

function DockLinks({ active }: { active: Active }) {
  const item = (isActive: boolean) =>
    `flex min-h-11 min-w-16 flex-1 items-center justify-center rounded-full text-sm font-medium ${
      isActive ? "text-primary" : "text-muted"
    }`;

  return (
    <nav
      aria-label="ride navigation"
      className="flex min-h-[64px] items-center justify-between rounded-full border border-hairline bg-surface/90 px-6 backdrop-blur"
    >
      <Link
        href="/rides"
        aria-current={active.rides ? "page" : undefined}
        className={item(active.rides)}
      >
        rides
      </Link>
      <Link
        href="/rides/new"
        aria-label="post a ride"
        aria-current={active.post ? "page" : undefined}
        className="flex flex-1 items-center justify-center"
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)] ${
            active.post ? "bg-content" : "bg-primary"
          }`}
        >
          <PlusIcon />
        </span>
      </Link>
      <Link
        href="/messages"
        aria-current={active.chats ? "page" : undefined}
        className={item(active.chats)}
      >
        chat
      </Link>
    </nav>
  );
}

function BottomNavInner() {
  const pathname = usePathname();

  // The chat thread has its own sticky bottom composer — stay out of its
  // way there. The chat list has no bottom bar, so the dock stays visible.
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

  return (
    <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <DockLinks active={active} />
    </div>
  );
}

/**
 * Phone-app bottom dock. Floating rounded bar: rides | + | chat.
 * Hidden on chat thread pages, which have their own sticky bottom input.
 */
export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
