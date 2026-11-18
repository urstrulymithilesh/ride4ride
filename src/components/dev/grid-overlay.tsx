"use client";

import { useEffect, useState } from "react";

const KEY = "r4r-grid";
const MAJOR = 100;
const MINOR = 20;

/**
 * Coordinate grid overlay for writing position-precise prompts ("move
 * the dock 4px", "the bar starts at x=12"). Lines every 20px, labels
 * every 100px on the top/left rulers, plus a live cursor readout.
 * pointer-events-none throughout, so the app stays fully usable under
 * it. Toggle with the G key or ?grid=1; persisted per device.
 */
export function GridOverlay() {
  // Same gate as the visual editor: dev builds, ?edit=1, or an explicit
  // ?grid=1. Random visitors never see it.
  const [allowed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const q = new URL(window.location.href).searchParams;
      if (q.get("grid") === "1") return true;
      if (q.get("grid") === "0") return false;
    } catch {
      // fall through to the env check
    }
    return (
      process.env.NODE_ENV === "development" ||
      (() => {
        try {
          return (
            new URL(window.location.href).searchParams.get("edit") === "1"
          );
        } catch {
          return false;
        }
      })()
    );
  });
  // On by default where allowed (phones have no G key): ?grid=0, a
  // stored "0", or the G toggle turns it off; ?grid=1 forces it on.
  const [on, setOn] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const q = new URL(window.location.href).searchParams.get("grid");
      if (q === "0") return false;
      if (q === "1") return true;
      return localStorage.getItem(KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const sync = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    sync();

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "g" || e.key === "G") {
        setOn((v) => {
          try {
            localStorage.setItem(KEY, v ? "0" : "1");
          } catch {
            // ignore
          }
          return !v;
        });
      }
    };
    const onMove = (e: PointerEvent) =>
      setCursor({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", sync);
    };
  }, []);

  if (!allowed || !on || size.w === 0) return null;

  const xs: number[] = [];
  for (let x = 0; x <= size.w; x += MAJOR) xs.push(x);
  const ys: number[] = [];
  for (let y = 0; y <= size.h; y += MAJOR) ys.push(y);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[200]"
    >
      {/* Minor + major lines. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, rgba(0,255,255,0.12) 0 1px, transparent 1px ${MINOR}px), repeating-linear-gradient(to bottom, rgba(0,255,255,0.12) 0 1px, transparent 1px ${MINOR}px), repeating-linear-gradient(to right, rgba(0,255,255,0.35) 0 1px, transparent 1px ${MAJOR}px), repeating-linear-gradient(to bottom, rgba(0,255,255,0.35) 0 1px, transparent 1px ${MAJOR}px)`,
        }}
      />
      {/* Rulers. */}
      <div className="absolute inset-x-0 top-0 h-5 bg-black/70">
        {xs.map((x) => (
          <span
            key={x}
            className="absolute top-0 text-[9px] leading-5 text-cyan-300"
            style={{ left: x + 2 }}
          >
            {x}
          </span>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 w-7 bg-black/70">
        {ys.map((y) => (
          <span
            key={y}
            className="absolute left-0.5 text-[9px] leading-none text-cyan-300"
            style={{ top: y + 2 }}
          >
            {y}
          </span>
        ))}
      </div>
      {/* Viewport size. */}
      <div className="absolute top-0 right-1 bg-black/70 px-1 text-[9px] leading-5 text-cyan-300">
        {size.w}×{size.h}
      </div>
      {/* Live cursor readout, pinned near the pointer. */}
      {cursor ? (
        <div
          className="absolute bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300"
          style={{
            left: Math.min(cursor.x + 12, size.w - 90),
            top: Math.min(cursor.y + 12, size.h - 24),
          }}
        >
          {cursor.x}, {cursor.y}
        </div>
      ) : null}
    </div>
  );
}
