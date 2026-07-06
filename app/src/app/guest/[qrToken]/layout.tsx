import type { Metadata } from "next";
import type { ReactNode } from "react";

// Per-table token URLs — private by construction. Crawlable-but-noindex
// (NOT robots.txt-disallowed) so search engines that find a shared link
// read the directive and drop the URL entirely.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function GuestQrLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-oat text-slate">
      <div className="flex-1">{children}</div>
      <footer className="border-t border-slate/5 px-6 py-5">
        <p className="text-center text-[11px] tracking-wide text-slate/40">
          Powered by TabCall
        </p>
      </footer>
    </div>
  );
}
