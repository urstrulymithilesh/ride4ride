"use client";

import { usePathname } from "next/navigation";

/**
 * Renders children everywhere except the landing page, which is styled
 * as a full-bleed page without app chrome.
 */
export function HideOnLanding({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return null;
  }
  return <>{children}</>;
}
