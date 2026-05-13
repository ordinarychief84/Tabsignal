import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { resolveByQrToken } from "@/lib/session";
import { meetsAtLeast, planFromOrg } from "@/lib/plans";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { FeedbackScreen } from "@/app/v/[slug]/t/[tableId]/feedback/feedback-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { qrToken: string } };

export default async function GuestQrReviewPage({ params }: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  const venue = await db.venue.findUnique({
    where: { id: resolved.venueId },
    include: {
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) notFound();
  const isPro = meetsAtLeast(planFromOrg(venue.org), "pro");

  // If the guest already has a profile cookie, skip the identify CTA.
  const profileToken = cookies().get(PROFILE_COOKIE)?.value;
  const alreadyIdentified =
    !!profileToken && !!(await verifyProfileToken(profileToken));

  // If they've already left feedback for this session, show the thank-you
  // state rather than re-rendering the rating UI.
  const existing = await db.feedbackReport.findFirst({
    where: { sessionId: resolved.sessionId },
    select: { id: true },
  });
  if (existing) {
    return (
      <main className="text-slate">
        <div className="mx-auto flex max-w-md flex-col px-6 py-10">
          <div className="rounded-2xl border border-slate/10 bg-white p-6 text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium">Feedback received</h1>
            <p className="mt-3 text-sm text-slate/60">
              Thank you. You&rsquo;ve already left feedback for this visit.
            </p>
            <Link
              href={`/guest/${encodeURIComponent(params.qrToken)}`}
              className="mt-6 inline-block text-sm text-umber underline-offset-4 hover:underline"
            >
              ← back to table
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {resolved.venueName}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            {venue.reviewPrompt ?? "How was tonight?"}
          </h1>
        </header>
        <FeedbackScreen
          slug={resolved.slug}
          sessionId={resolved.sessionId}
          sessionToken={resolved.sessionToken}
          showIdentify={isPro && !alreadyIdentified}
        />
      </div>
    </main>
  );
}

function InvalidScan({ reason }: { reason: string }) {
  return (
    <main className="flex flex-1 flex-col text-slate">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium">QR code expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Ask your server for a fresh code, or speak with them directly.
          </p>
          <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">
            {reason}
          </p>
        </div>
      </div>
    </main>
  );
}
