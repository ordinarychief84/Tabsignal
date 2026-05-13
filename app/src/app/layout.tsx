import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TabCall · all-in-one hospitality platform",
  description:
    "TabCall sits on top of any POS. Guests scan, staff get alerted, service moves.",
};

// WCAG 1.4.4: never block pinch-zoom. Guests in dim bars need it,
// staff with one-hand-on-tray need it. Fixed-width layout doesn't
// reflow under zoom, so disabling it costs accessibility for nothing.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0b19",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Material Symbols Outlined — variable icon font used by the
            landing redesign. preconnect is the next/font pattern for any
            Google Fonts resource we load by hand. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..600,0..1,-25..200&display=swap"
        />
      </head>
      <body className="bg-oat font-sans text-slate antialiased">{children}</body>
    </html>
  );
}
