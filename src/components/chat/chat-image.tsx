"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET } from "@/lib/chat";

/**
 * Renders a chat image from a PRIVATE storage path by minting a short-lived
 * signed URL. Storage RLS only lets participants create the URL, so images
 * stay as private as the conversation.
 */
export function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (failed) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-lg bg-surface-2 text-xs text-faint">
        Image unavailable
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url ?? undefined}
      alt="Shared image"
      className={`h-auto w-full max-w-[240px] rounded-lg ${
        url ? "" : "h-40 animate-pulse bg-surface-2"
      }`}
    />
  );
}
