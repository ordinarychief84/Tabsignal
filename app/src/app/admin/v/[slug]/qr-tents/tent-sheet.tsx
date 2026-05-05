"use client";

type Tent = {
  label: string;
  zone: string | null;
  url: string;
  svg: string; // raw <svg>...</svg>
};

export function TentSheet({
  venueName,
  brandColor,
  tents,
}: {
  venueName: string;
  brandColor: string;
  tents: Tent[];
}) {
  return (
    <main className="bg-slate-100 print:bg-white">
      {/* Print CSS — letter paper, no UI chrome, two tents per page. */}
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
            <p className="text-xs uppercase tracking-wider text-slate-500">{venueName}</p>
            <h1 className="text-xl font-semibold text-slate-900">QR tent cards</h1>
            <p className="mt-1 text-sm text-slate-600">
              {tents.length} table{tents.length === 1 ? "" : "s"}. Use your browser&rsquo;s print dialog
              (⌘P) to save as PDF or print directly. One tent per page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 pb-12">
        {tents.map(t => (
          <article
            key={t.label}
            className="tent tent-page mx-auto flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none"
            style={{ borderTopColor: brandColor, borderTopWidth: 6 }}
          >
            <p className="text-xs uppercase tracking-wider" style={{ color: brandColor }}>
              {venueName}
            </p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">{t.label}</h2>
            {t.zone ? <p className="text-xs text-slate-500">{t.zone}</p> : null}

            <div
              className="my-6 h-44 w-44"
              dangerouslySetInnerHTML={{ __html: t.svg }}
              aria-label={`QR code for ${t.label}`}
            />

            <p className="text-sm text-slate-700">Scan to call your server</p>
            <p className="mt-1 text-[10px] text-slate-400 break-all">{t.url}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
