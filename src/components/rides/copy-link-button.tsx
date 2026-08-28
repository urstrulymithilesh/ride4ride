"use client";

import { useState } from "react";

/** Copies the current post's URL to the clipboard with quick feedback. */
export function CopyLinkButton({
  path,
  compact = false,
}: {
  path: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url =
      typeof window !== "undefined" ? window.location.origin + path : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — select-and-copy fallback.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`btn btn-secondary ${compact ? "px-3 text-xs" : "text-sm"}`}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
