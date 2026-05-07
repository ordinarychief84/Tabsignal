import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight">Not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            That table&rsquo;s not on the floor tonight, or the link expired.
            Ask your server for a fresh QR.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-umber underline-offset-4 hover:underline"
          >
            ← back to TabCall
          </Link>
        </div>
      </div>
    </main>
  );
}
