import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FeedbackScreen } from "./feedback-screen";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }: { params: { slug: string; tableId: string } }) {
  const venue = await db.venue.findUnique({ where: { slug: params.slug } });
  if (!venue) notFound();

  const tableSeg = safeDecode(params.tableId);
  // Find the most recent paid (or active) session at this table.
  const session = await db.guestSession.findFirst({
    where: { venueId: venue.id, OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }] },
    orderBy: { createdAt: "desc" },
    include: { feedback: true },
  });
  if (!session) notFound();

  if (session.feedback.length > 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <p className="text-center text-sm text-slate-500">You&rsquo;ve already left feedback for this visit.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-slate-500">{venue.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Feedback</h1>
      </header>
      <FeedbackScreen sessionId={session.id} />
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
