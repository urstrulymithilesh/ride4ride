"use client";

/**
 * Empty-feed call to action. Fires an event the bottom dock listens for
 * so the quick-post popup opens in place — no navigation to /rides/new.
 */
export const OPEN_POST_EVENT = "r4r:open-post";

export function openPostPopup() {
  window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT));
}

export function EmptyPostCta() {
  return (
    <button
      type="button"
      onClick={openPostPopup}
      className="mt-3 inline-block min-h-11 text-sm font-medium text-primary"
    >
      be the first to post one
    </button>
  );
}
