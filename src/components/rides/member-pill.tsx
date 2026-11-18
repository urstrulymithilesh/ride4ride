"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PersonGlyph } from "@/components/places/search-icons";

/**
 * Live member total pill ("ride4ride.com [glyph] 04"). Seeds from the
 * server's cached count, then tracks `profiles` over Realtime so the
 * number moves the moment someone joins or leaves — even from zero.
 * A 30s poll backs the socket up (missed events self-heal). Failures
 * keep the last known number rather than hiding the pill.
 */
export function MemberPill({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      if (!stopped && !error && count !== null) setCount(count);
    };
    const channel = supabase
      .channel("member-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        fetchCount,
      )
      .subscribe();
    const timer = window.setInterval(fetchCount, 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(0.35rem+env(safe-area-inset-bottom))] z-[var(--z-chrome)] flex justify-center px-4">
      <span className="glass-dark pointer-events-auto flex items-center gap-1 rounded-full px-3.5 pb-0.5 pt-0.5 text-[11px] font-medium text-white/70 opacity-[0.85]">
        ride4ride.com
        <PersonGlyph height={9} />
        <span>{count.toString().padStart(2, "0")}</span>
      </span>
    </div>
  );
}
