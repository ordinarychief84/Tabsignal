"use client";

type Tent = {
  label: string;
  zone: string | null;
  url: string;
  svg: string; // raw <svg>...</svg>
};

export function TentSheet({
  venueName,
  tents,
}: {
  venueName: string;
  brandColor?: string; // accepted for back-compat; unused — chartreuse is the consistent mark
  tents: Tent[];
}) {
  return (
    <main className="bg-oat print:bg-white">
      {/* Print CSS — letter paper, no UI chrome, one tent per page. */}
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          .tent-page { break-after: page; }
          body { background: white !important; }
        }
        .tent {
          width: 7.5in;
          height: 5in;
          page-break-inside: avoid;
        }
      `}</style>

      <div className="no-print mx-auto max-w-3xl px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venueName}</p>
            <h1 className="mt-1 text-xl font-medium text-slate">QR tent cards</h1>
            <p className="mt-1 text-sm text-slate/65">
              {tents.length} table{tents.length === 1 ? "" : "s"}. ⌘P to save as PDF or print
              directly. One tent per page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-slate px-4 py-2.5 text-sm font-medium text-oat"
          >
            Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 pb-12">
        {tents.map(t => (
          <article
            key={t.label}
            className="tent tent-page mx-auto flex flex-col items-center justify-center rounded-2xl border border-slate/10 bg-white p-8 print:rounded-none print:border-0"
            style={{ borderTopColor: "#C9F61C", borderTopWidth: 6 }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
              {venueName}
            </p>
            <h2 className="mt-1 text-3xl font-medium text-slate">{t.label}</h2>
            {t.zone ? <p className="text-xs text-slate/55">{t.zone}</p> : null}

            <div
              className="my-6 h-44 w-44"
              dangerouslySetInnerHTML={{ __html: t.svg }}
              aria-label={`QR code for ${t.label}`}
            />

            <p className="text-sm text-slate/70">Scan to call your server</p>
            <p className="mt-1 break-all text-[10px] text-slate/40">{t.url}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
