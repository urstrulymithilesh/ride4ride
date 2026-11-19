"use client";

import { useRouter } from "next/navigation";

/** Back arrow: history back, falling back to the feed when there is no
 *  history to go back to (fresh tab, shared link). */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      aria-label="Back"
      className="flex h-11 w-11 items-center justify-center text-white"
    >
      <svg
        width="32"
        height="24"
        viewBox="0 0 32 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M29 12H4" />
        <path d="M11 5L4 12L11 19" />
      </svg>
    </button>
  );
}
