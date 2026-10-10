"use client";

import { useEffect, useRef } from "react";

const MAX_PX = 26;
const MIN_PX = 14;

/**
 * Single-line headline that shrinks to fit instead of truncating early.
 * Measures imperatively after mount (no state round-trip): starts at the
 * design size and steps down 1px until scrollWidth fits clientWidth.
 * Re-fits on webfont swap and window resize. The truncate class stays as
 * the last resort at MIN_PX.
 */
export function FitHeadline({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      let size = MAX_PX;
      el.style.fontSize = `${size}px`;
      while (size > MIN_PX && el.scrollWidth > el.clientWidth + 1) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    const raf = requestAnimationFrame(() => fit());
    try {
      void document.fonts?.ready.then(() => fit());
    } catch {
      // Older browsers without the FontFaceSet API — initial fit stands.
    }
    window.addEventListener("resize", fit);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, [text]);

  return (
    <p
      ref={ref}
      title={text}
      className="mt-1.5 truncate text-[26px] font-semibold leading-tight"
    >
      <span className="text-success">{text}</span>
    </p>
  );
}
