"use client";

/**
 * Empty-feed call to action. Fires an event the bottom dock listens for
 * so the stepped post popup opens in place.
 */
export const OPEN_POST_EVENT = "r4r:open-post";

export function openPostPopup() {
  window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT));
}

export function EmptyPostCta({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={openPostPopup}
      className={
        compact
          ? "min-h-9 whitespace-nowrap text-[11px] font-semibold text-primary"
          : "mt-3 inline-block min-h-11 text-sm font-medium text-primary"
      }
    >
      {compact ? "post one" : "be the first to post one"}
    </button>
  );
}
