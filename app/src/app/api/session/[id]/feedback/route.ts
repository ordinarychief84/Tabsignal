import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { classifyFeedback } from "@/lib/ai/classify-feedback";
import { badRatingHtml, badRatingSubject, badRatingText } from "@/lib/email/bad-rating-email";
import { sendEmail } from "@/lib/email/send";
import { signCompToken } from "@/lib/auth/comp-token";

const COMP_DEFAULT_CENTS = 2000; // $20

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  note: z.string().max(400).optional(),
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
    include: { venue: { select: { id: true, name: true, googlePlaceId: true } }, table: { select: { label: true } } },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  // PRD F4: only one feedback per session.
  const existing = await db.feedbackReport.findFirst({ where: { sessionId: session.id } });
  if (existing) return NextResponse.json({ error: "ALREADY_RATED" }, { status: 409 });

  // Happy path: 4–5 stars → return Google deep link, no AI/email.
  if (parsed.rating >= 4) {
    await db.feedbackReport.create({
      data: {
        venueId: session.venueId,
        sessionId: session.id,
        rating: parsed.rating,
        note: parsed.note ?? null,
      },
    });
    const reviewUrl = session.venue.googlePlaceId
      ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(session.venue.googlePlaceId)}`
      : null;
    return NextResponse.json({ ok: true, reviewUrl });
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

  await db.feedbackReport.create({
    data: {
      venueId: session.venueId,
      sessionId: session.id,
      rating: parsed.rating,
      note: parsed.note ?? null,
      aiCategory: classification.category,
      aiSuggestion: classification.suggestion,
      aiServerName: classification.serverName,
    },
  });

  // Email owners + managers. Resolve recipients: any StaffMember with an email on this venue.
  const recipients = await db.staffMember.findMany({
    where: { venueId: session.venueId },
    select: { email: true },
  });
  const to = recipients.map(r => r.email).filter(Boolean);

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

  return NextResponse.json({ ok: true });
}
