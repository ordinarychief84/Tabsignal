import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TabCall — fix slow table service",
  description:
    "TabCall sits on top of any POS. Guests scan, staff get alerted, service moves.",
};

// WCAG 1.4.4: never block pinch-zoom. Guests in dim bars need it,
// staff with one-hand-on-tray need it. Fixed-width layout doesn't
// reflow under zoom, so disabling it costs accessibility for nothing.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E0F1A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-oat font-sans text-slate antialiased">{children}</body>
    </html>
  );
}
