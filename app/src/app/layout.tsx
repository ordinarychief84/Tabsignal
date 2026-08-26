import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { defaultMetadata } from "@/lib/seo";
import "./globals.css";

/**
 * Poppins — friendly geometric, per the brand direction.
 *
 * Four weights only. The brief warns against excessive Bold, and every
 * extra weight is another font file on a guest's phone over restaurant
 * wifi. The CSS variable keeps its old name so the Tailwind fontFamily
 * entry and any inline references still resolve.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Site-wide SEO defaults (metadataBase, title template, OG/Twitter,
// keyword pool). Marketing pages override via lib/seo pageMetadata().
export const metadata: Metadata = defaultMetadata;

// WCAG 1.4.4: never block pinch-zoom. Guests in dim bars need it,
// staff with one-hand-on-tray need it. Fixed-width layout doesn't
// reflow under zoom, so disabling it costs accessibility for nothing.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#34263F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
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
