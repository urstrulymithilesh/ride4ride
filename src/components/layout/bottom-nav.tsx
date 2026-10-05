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
  chats: boolean;
  post: boolean;
}

function DockLinks({ active }: { active: Active }) {
  const item = (isActive: boolean) =>
    `flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full ${
      isActive ? "text-[17.5px] font-bold text-white" : "text-sm font-medium text-muted"
    }`;

  return (
    <nav
      aria-label="ride navigation"
      className="flex items-center justify-between rounded-t-[16px] border border-b-0 border-white/20 bg-app/95 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
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
          className={`flex h-16 w-16 -mt-5 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)] ${
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
        chats
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
    chats: pathname === "/messages",
    post:
      pathname === "/rides/new" ||
      pathname === "/rides/offer" ||
      pathname === "/rides/get",
  };

  return (
    <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2">
      <DockLinks active={active} />
    </div>
  );
}

/**
 * Phone-app bottom dock. Full-width bar with rounded top corners only:
 * rides | + | chats. The + button straddles the top edge. Hidden on
 * chat thread pages, which have their own sticky bottom input.
 */
export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
