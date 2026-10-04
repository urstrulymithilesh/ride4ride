import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/layout/bottom-nav";

// Geometric sans for the whole site, normal + italic.
const mono = Montserrat({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "ride4ride",
    template: "%s · ride4ride",
  },
  description: "ride-sharing for the student community.",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to take effect.
export const viewport: Viewport = {
  themeColor: "#000000",
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
          <div id="main" className="flex flex-1 flex-col pb-24 pt-6">
            {children}
          </div>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
