import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BottomNav } from "@/components/layout/bottom-nav";

// Consolas-like monospace with a straight lowercase "l" (JetBrains Mono
// distinguishes l/1/I by construction). Native Consolas kept as the first
// fallback in the CSS stacks.
const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Ride4Ride",
    template: "%s · Ride4Ride",
  },
  description: "Ride-sharing for the student community.",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to take effect.
export const viewport: Viewport = {
  themeColor: "#e9eef6",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="app-shell">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white"
          >
            Skip to content
          </a>
          <SiteHeader />
          <div id="main" className="flex flex-1 flex-col pb-24">
            {children}
          </div>
          <SiteFooter />
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
