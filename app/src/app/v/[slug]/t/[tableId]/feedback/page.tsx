import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { resolveGuestSession } from "@/domain/sessions/resolve";
import { meetsAtLeast, planFromOrg } from "@/lib/plans";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { guestExperienceFrom } from "@/lib/guest-experience";
import { consentText } from "@/lib/consent";
import { serverForTable } from "@/lib/server-identity";
import { FeedbackScreen } from "./feedback-screen";

export const dynamic = "force-dynamic";


type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

export default async function FeedbackPage({ params, searchParams }: PageProps) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    include: { org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } } },
  });
  if (!venue) notFound();
  const isPro = meetsAtLeast(planFromOrg(venue.org), "pro");

  // If the guest already has a profile cookie, skip the prompt entirely.
  const profileToken = cookies().get(PROFILE_COOKIE)?.value;
  const alreadyIdentified = !!profileToken && !!(await verifyProfileToken(profileToken));

  // Same credential and same resolver as the rest of the table surface.
  // This used to compare `?s=` against the SESSION token while the entry
  // and home pages compared it against the QR token, so a link that
  // worked on one page was a dead end on the next.
  const tableSeg = safeDecode(params.tableId);
  let resolved;
  try {
    resolved = await resolveGuestSession(params.slug, tableSeg, searchParams.s ?? null);
  } catch {
    return <ScanPrompt />;
  }

  const session = await db.guestSession.findUnique({
    where: { id: resolved.sessionId },
    include: { feedback: true },
  });
  if (!session) notFound();

  // Without the matching session token, anyone could navigate here and the
  // page would render a FeedbackScreen pre-loaded with the previous party's
  // sessionToken (a secret) — letting them silently take over the tab.
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

  const config = guestExperienceFrom(venue.enabledFeatures);
  // Name the server on the "what stood out?" chips when the table has one.
  const server = await serverForTable({
    tableId: session.tableId,
    venueName: venue.name,
    venueWelcomeMessage: venue.guestWelcomeMessage,
  });
  // isPro / alreadyIdentified drive the Pro "Regulars" pairing prompt,
  // which is a separate opt-in from this venue-scoped contact capture.
  void isPro;
  void alreadyIdentified;

  return (
    <FeedbackScreen
      venueName={venue.name}
      venueSlug={params.slug}
      sessionId={session.id}
      sessionToken={session.sessionToken}
      serverName={server?.displayName ?? null}
      consentText={consentText(venue.name)}
      phoneCaptureEnabled={config.phoneCapture}
      marketingConsentEnabled={config.marketingConsent}
      serviceRecoveryEnabled={config.serviceRecovery}
    />
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Reached without a valid scan. */
function ScanPrompt() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-oat text-slate">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Scan the QR</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Feedback is tied to your visit. Scan the code on your table to
            leave a rating.
          </p>
        </div>
      </div>
    </main>
  );
}
