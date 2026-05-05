export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-semibold">TabCall</h1>
      <p className="mt-2 text-sm text-slate-500">
        Scan a venue QR code to begin. This page is the public root — guests land
        on <code className="font-mono text-xs">/v/[venue]/t/[table]</code>.
      </p>
    </main>
  );
}
