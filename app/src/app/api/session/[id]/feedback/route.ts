import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { classifyFeedback } from "@/lib/ai/classify-feedback";
import { badRatingHtml, badRatingSubject, badRatingText } from "@/lib/email/bad-rating-email";
import { sendEmail } from "@/lib/email/send";
import { venueAlertRecipients } from "@/lib/email/recipients";
import { signCompToken } from "@/lib/auth/comp-token";
import { attributionForSession, shiftBucketFor } from "@/domain/reviews/attribution";
import { googleReviewUrl } from "@/domain/reviews/links";
import { sanitizeTags, sentimentFor } from "@/lib/feedback";
import { events } from "@/lib/realtime";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const COMP_DEFAULT_CENTS = 2000; // $20

// Tie feedback to the guest who actually owns the tab. Without this
// check, anyone who scrapes a session ID (visible in the QR URL flow)
// can fire a 1-star + AI/email amplification per session.
const Body = z.object({
  rating: z.number().int().min(1).max(5),
  note: z.string().max(400).optional(),
  sessionToken: z.string().min(1),
  // Chips from a fixed server-side vocabulary. Anything outside it is
  // dropped rather than rejected — a stale client shouldn't cost the guest
  // the rating they already gave.
  tags: z.array(z.string().max(40)).max(12).optional(),
  // The guest explicitly asked for a manager. A low rating on its own does
  // NOT mean this: "I'd rather just leave" is a valid answer, and turning
  // every bad score into a manager visit is how you make people stop
  // rating honestly.
  managerRecovery: z.boolean().optional(),
});

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: {
      venue: { select: { id: true, name: true, googlePlaceId: true, timezone: true } },
      table: { select: { label: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Rate-limit AFTER the token check so an attacker who knows the session
  // id can't burn the bucket on a stranger. Caps repeat hits per session
  // (5/min) — the user-facing rule is still "one feedback per session"
  // enforced by the existing check, but the limiter also chokes off the
  // race window where two concurrent POSTs could each pass the existence
  // check before either inserts.
  const fbGate = await rateLimitAsync(`feedback:${session.id}`, { windowMs: 60_000, max: 5 });
  if (!fbGate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: fbGate.retryAfterMs }, { status: 429 });
  }

  // PRD F4: only one feedback per session.
  const existing = await db.feedbackReport.findFirst({ where: { sessionId: session.id } });
  if (existing) return NextResponse.json({ error: "ALREADY_RATED" }, { status: 409 });

  // HONEST REVIEW LINK: computed once, returned for EVERY rating.
  // Google's policy prohibits review gating (selectively soliciting
  // positive reviews); the old ≥4-only branch was exactly that. Unhappy
  // guests still get the private-note + manager-intercept path as
  // additional support — but the public link is never withheld.
  const reviewUrl = googleReviewUrl(session.venue.googlePlaceId);

  // R2 attribution: who served this table (last acknowledging staff)
  // and which shift, in the venue's timezone. Never blocks feedback.
  let servedBy: Awaited<ReturnType<typeof attributionForSession>> = null;
  try {
    servedBy = await attributionForSession(session.id);
  } catch { /* attribution is best-effort */ }
  const shiftBucket = shiftBucketFor(new Date(), session.venue.timezone);
  const attribution = {
    servedByStaffId: servedBy?.staffId ?? null,
    servedByName: servedBy?.staffName ?? null,
    shiftBucket,
  };

  const tags = sanitizeTags(parsed.rating, parsed.tags);
  const sentiment = sentimentFor(parsed.rating);
  // Recovery is only ever what the guest asked for, and only on a
  // negative rating — a happy guest who somehow sent the flag doesn't
  // summon a manager to their table.
  const wantsRecovery = Boolean(parsed.managerRecovery) && sentiment === "NEGATIVE";

  // Happy path: 4–5 stars → no AI/email.
  if (parsed.rating >= 4) {
    await db.feedbackReport.create({
      data: {
        venueId: session.venueId,
        sessionId: session.id,
        rating: parsed.rating,
        note: parsed.note ?? null,
        sentiment,
        ...attribution,
        ...(tags.length ? { tags: { create: tags.map(tag => ({ tag })) } } : {}),
      },
    });
    return NextResponse.json({ ok: true, reviewUrl, sentiment });
  }

  // Bad-review intercept: 1–3 stars → classify + persist + email.
  // Classification failure must never break the user-facing flow — fall back to a stored uncategorized record.
  let classification;
  try {
    classification = await classifyFeedback({ rating: parsed.rating, note: parsed.note ?? null });
  } catch (e) {
    classification = {
      category: "other" as const,
      confidence: "low" as const,
      suggestion: "Reach out to the guest directly to learn more.",
      serverName: null,
    };
  }

  const report = await db.feedbackReport.create({
    data: {
      venueId: session.venueId,
      sessionId: session.id,
      rating: parsed.rating,
      note: parsed.note ?? null,
      sentiment,
      managerRecoveryRequested: wantsRecovery,
      aiCategory: classification.category,
      aiSuggestion: classification.suggestion,
      aiServerName: classification.serverName,
      ...attribution,
      ...(tags.length ? { tags: { create: tags.map(tag => ({ tag })) } } : {}),
    },
    select: { id: true },
  });

  // Service recovery: the guest is still in the building and has asked to
  // speak to someone. This goes out on the realtime channel so it lands on
  // whatever the venue actually watches — manager dashboard, service
  // display, host tablet — rather than waiting on an email nobody reads
  // mid-service.
  //
  // No phone number and no guest identity in the payload. It reaches the
  // floor, and the floor has no business holding either.
  if (wantsRecovery) {
    void events.serviceRecovery(session.venueId, {
      feedbackId: report.id,
      tableLabel: session.table.label,
      rating: parsed.rating,
      category: classification.category,
      tags,
      serverName: attribution.servedByName,
      createdAt: new Date().toISOString(),
    });
  }

  // Email owners + managers. Routing precedence: Venue.alertEmails (if
  // set) → all StaffMembers → OPERATOR_EMAILS. The resolver dedupes +
  // lowercases the result. Manager-configured override on Settings wins.
  const to = await venueAlertRecipients(session.venueId);

  // If the tab is still open (not paid), include a "Comp $20 to Table N"
  // CTA in the email so the manager can apply the credit in one tap.
  let compCta: { url: string; amountCents: number } | undefined;
  if (!session.paidAt && session.expiresAt.getTime() > Date.now()) {
    try {
      const token = await signCompToken({
        sessionId: session.id,
        venueId: session.venueId,
        amountCents: COMP_DEFAULT_CENTS,
        tableLabel: session.table.label,
      });
      compCta = {
        url: `${APP_URL}/comp/${encodeURIComponent(token)}`,
        amountCents: COMP_DEFAULT_CENTS,
      };
    } catch {
      // Sign failure shouldn't break the email path.
    }
  }

  const baseArgs = {
    venueName: session.venue.name,
    tableLabel: session.table.label,
    rating: parsed.rating,
    note: parsed.note ?? null,
    classification,
    occurredAt: new Date(),
    staffQueueUrl: `${APP_URL}/staff`,
    compCta,
  };

  if (to.length > 0) {
    try {
      await sendEmail({
        to,
        subject: badRatingSubject(baseArgs),
        html: badRatingHtml(baseArgs),
        text: badRatingText(baseArgs),
      });
    } catch {
      // log/observability hook would go here; never fail the guest's feedback POST on email failure
    }
  }

  // Honest link on the low-rating path too — same URL as 5★.
  return NextResponse.json({ ok: true, reviewUrl, sentiment, recoveryRequested: wantsRecovery });
}
