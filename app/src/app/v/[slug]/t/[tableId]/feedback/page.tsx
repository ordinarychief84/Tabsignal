import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { meetsAtLeast, planFromOrg } from "@/lib/plans";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { FeedbackScreen } from "./feedback-screen";

export const dynamic = "force-dynamic";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

export default async function FeedbackPage({ params, searchParams }: PageProps) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    include: { org: { select: { subscriptionPriceId: true, subscriptionStatus: true } } },
  });
  if (!venue) notFound();
  const isPro = meetsAtLeast(planFromOrg(venue.org), "pro");

  // If the guest already has a profile cookie, skip the prompt entirely.
  const profileToken = cookies().get(PROFILE_COOKIE)?.value;
  const alreadyIdentified = !!profileToken && !!(await verifyProfileToken(profileToken));

  const tableSeg = safeDecode(params.tableId);
  const session = await db.guestSession.findFirst({
    where: { venueId: venue.id, OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }] },
    orderBy: { createdAt: "desc" },
    include: { feedback: true },
  });
  if (!session) notFound();

  // Without the matching session token, anyone could navigate here and the
  // page would render a FeedbackScreen pre-loaded with the previous party's
  // sessionToken (a secret) — letting them silently take over the tab.
  const providedToken = searchParams.s ?? "";
  if (!providedToken || !tokensEqual(session.sessionToken, providedToken)) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Scan the QR</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/60">
              Feedback is tied to your scan. Scan the table QR to leave a rating.
            </p>
          </div>
        </div>
      </main>
    );
  }

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
        <FeedbackScreen
          slug={params.slug}
          sessionId={session.id}
          sessionToken={session.sessionToken}
          showIdentify={isPro && !alreadyIdentified}
        />
      </div>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
