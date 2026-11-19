"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread chat count badge pinned to the dock's chat tab. Polls every
 * 30s (same cadence as the feed refresh) and refetches on any incoming
 * message over Realtime (RLS scopes events to the viewer's own
 * conversations). Zero means no badge, not a "0" badge.
 */
export function ChatBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let stopped = false;
    const supabase = createClient();
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/chat/unread");
        const data = await res.json().catch(() => null);
        if (!stopped && typeof data?.unread === "number") {
          setUnread(Math.max(0, data.unread));
        }
      } catch {
        // Offline etc: keep the last known count.
      }
    };
    fetchCount();
    const timer = window.setInterval(fetchCount, 30000);
    const channel = supabase
      .channel("chat-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        fetchCount,
      )
      .subscribe();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  if (unread <= 0) return null;
  return (
    <span
      aria-label={`${unread} unread messages`}
      className="pointer-events-none absolute -top-0.5 right-1/2 flex h-[18px] min-w-[18px] translate-x-6 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
