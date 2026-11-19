/** Global route-loading fallback (shown during navigation to dynamic pages). */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 items-center justify-center py-24"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
