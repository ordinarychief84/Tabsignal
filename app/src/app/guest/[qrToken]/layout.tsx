import type { ReactNode } from "react";

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
