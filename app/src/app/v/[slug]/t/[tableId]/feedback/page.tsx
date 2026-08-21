import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { meetsAtLeast, planFromOrg } from "@/lib/plans";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { guestExperienceFrom } from "@/lib/guest-experience";
import { consentText } from "@/lib/consent";
import { serverForTable } from "@/lib/server-identity";
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
    include: { org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } } },
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
