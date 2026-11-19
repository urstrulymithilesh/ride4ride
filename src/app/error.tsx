"use client";

import { useEffect } from "react";

/** Global error boundary for the app segment. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where you'd report to your error tracker.
    console.error(error);
  }, [error]);

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <h1 className="text-xl font-semibold text-content">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred. You can try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="btn btn-primary mt-6 w-full"
      >
        Try again
      </button>
    </main>
  );
}
