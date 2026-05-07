import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FeedbackScreen } from "./feedback-screen";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }: { params: { slug: string; tableId: string } }) {
  const venue = await db.venue.findUnique({ where: { slug: params.slug } });
  if (!venue) notFound();

  const tableSeg = safeDecode(params.tableId);
  const session = await db.guestSession.findFirst({
    where: { venueId: venue.id, OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }] },
    orderBy: { createdAt: "desc" },
    include: { feedback: true },
  });
  if (!session) notFound();

  if (session.feedback.length > 0) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium">Feedback received.</h1>
            <p className="mt-3 text-sm text-slate/60">
              Thank you. You&rsquo;ve already left feedback for this visit.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">How was tonight?</h1>
        </header>
        <FeedbackScreen sessionId={session.id} sessionToken={session.sessionToken} />
      </div>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
