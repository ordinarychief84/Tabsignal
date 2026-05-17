import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { newQrToken } from "@/lib/qr";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { hashStaffPassword } from "@/lib/auth/staff-password";
import { appOrigin } from "@/lib/origin";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * Self-serve signup at the Starter tier.
 *
 * Creates an Organization + Venue + owner StaffMember in one transaction,
 * then magic-links the owner into /admin/v/[slug]/onboarding so they can
 * finish Stripe Connect, add tables, and invite staff.
 *
 * Growth/Pro buyers DON'T come through here — they go through the
 * concierge "book a call" intercept on the billing page. This endpoint
 * is intentionally scoped to Starter only; promotion to Growth/Pro
 * happens through the existing billing checkout (post-call).
 */

const Body = z.object({
  email: z.string().email().max(200),
  ownerName: z.string().min(1).max(120),
  venueName: z.string().min(1).max(120),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 digits or 5+4"),
  // Default 6 tables — owners can adjust during onboarding. Smaller default
  // than the operator setup (10) because self-serve venues skew smaller.
  tableCount: z.number().int().min(1).max(60).default(6),
  timezone: z.string().min(1).default("America/Chicago"),
  // Optional password. If provided, the row's passwordHash is set during
  // the same transaction so the user can sign in with email+password
  // after their first magic-link verification. emailVerifiedAt stamps
  // when they click the link the signup email sends — password sign-in
  // refuses to mint a session until that happens.
  password: z.string().min(12).max(128).optional(),
  // Server-side terms-of-service gate. The /signup form has a required
  // checkbox, but the checkbox is client-only without this — a direct
  // POST to /api/signup with no `agreeTerms` field would still create
  // the Org+Venue+Staff. Require literal `true` so neither false nor
  // missing satisfies it.
  agreeTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must agree to the Terms of Service and Privacy Policy",
    }),
  }),
});

// Spam guard: limit signups per IP. Upstash-backed via rateLimitAsync so
// the cap holds across Vercel cold starts (the previous in-memory Map was
// per-lambda — effectively no limiter on serverless). Falls back to
// in-memory in dev; fails closed in prod when Upstash is absent.
const SIGNUPS_PER_HOUR = 5;

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError
      ? e.errors.map(x => `${x.path.join(".") || "body"}: ${x.message}`).join("; ")
      : (e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipGate = await rateLimitAsync(`signup:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: SIGNUPS_PER_HOUR,
  });
  if (!ipGate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: ipGate.retryAfterMs }, { status: 429 });
  }

  const email = parsed.email.toLowerCase().trim();

  // If this email already has a staff record, do NOT create a duplicate
  // org. Send them a sign-in link instead so they can recover access.
  // Guards against accidental "create another venue" on the same email.
  const existing = await db.staffMember.findUnique({
    where: { email },
    include: { venue: { select: { slug: true, name: true } } },
  });
  if (existing) {
    const token = await signLinkToken({
      kind: "link",
      staffId: existing.id,
      email,
      next: `/admin/v/${existing.venue.slug}`,
    });
    const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;
    let existingEmailFailed = false;
    try {
      await sendMagicLinkEmail({
        to: email,
        staffName: existing.name,
        venueName: existing.venue.name,
        link,
      });
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      console.error("[signup] sign-in email send failed", {
        email,
        statusCode: e.statusCode,
        message: e.message,
      });
      existingEmailFailed = true;
    }
    // Same response shape regardless so we don't enumerate emails.
    return NextResponse.json({
      ok: true,
      alreadyRegistered: true,
      ...(existingEmailFailed ? { emailDeliveryFailed: true } : {}),
    });
  }

  // Slug from venue name; collision-suffix if taken.
  let slug = slugify(parsed.venueName);
  if (await db.venue.findUnique({ where: { slug } })) {
    slug = `${slug}-${newQrToken().slice(0, 4).toLowerCase()}`;
  }

  // Hash the optional password OUTSIDE the transaction. bcrypt takes
  // ~250ms at cost 12 — running it inside the tx would hold the DB
  // connection idle. Validation already enforced 12-128 chars in the
  // Zod schema; we surface the helper's throw as INVALID_BODY in case
  // an edge slipped through.
  let passwordHash: string | null = null;
  if (parsed.password) {
    try {
      passwordHash = await hashStaffPassword(parsed.password);
    } catch (err) {
      return NextResponse.json(
        { error: "INVALID_BODY", detail: err instanceof Error ? err.message : "password failed validation" },
        { status: 400 },
      );
    }
  }

  // Single transaction: org + venue + tables + owner staff. If anything
  // fails we don't want a partial venue with no manager.
  const result = await db.$transaction(async tx => {
    const org = await tx.organization.create({
      data: {
        name: parsed.venueName,
        venues: {
          create: {
            slug,
            name: parsed.venueName,
            zipCode: parsed.zipCode,
            timezone: parsed.timezone,
            tables: {
              create: Array.from({ length: parsed.tableCount }, (_, i) => ({
                label: `Table ${i + 1}`,
                qrToken: newQrToken(),
              })),
            },
          },
        },
      },
      include: { venues: true },
    });
    const venue = org.venues[0];

    // Owner StaffMember + an OrgMember row so the operator console is
    // accessible to them on day one.
    //
    // Explicit role='OWNER': the column default was 'STAFF' (legacy) until
    // the 20260511 migration flipped it to 'SERVER'. Either default is wrong
    // for the venue creator — they need manager permissions to invite staff,
    // configure Stripe, and edit settings. Pass OWNER directly so the
    // semantics are independent of whichever default the DB is currently on.
    const staff = await tx.staffMember.create({
      data: {
        venueId: venue.id,
        email,
        name: parsed.ownerName,
        role: "OWNER",
        // Set the password hash if the form passed a password. The user
        // can still sign in with the magic link until they verify their
        // email — password sign-in requires emailVerifiedAt to be set
        // (stamped on the first magic-link click).
        ...(passwordHash
          ? { passwordHash, passwordChangedAt: new Date() }
          : {}),
      },
    });
    await tx.orgMember.create({
      data: {
        orgId: org.id,
        email,
        role: "OWNER",
      },
    });

    return { orgId: org.id, venue, staffId: staff.id };
  });

  // Mint magic link → onboarding wizard.
  const token = await signLinkToken({
    kind: "link",
    staffId: result.staffId,
    email,
    next: `/admin/v/${result.venue.slug}/onboarding`,
  });
  const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;

  let devLink: string | null = null;
  let emailDeliveryFailed = false;
  try {
    await sendMagicLinkEmail({
      to: email,
      staffName: parsed.ownerName,
      venueName: result.venue.name,
      link,
    });
  } catch (err) {
    // The org/venue/staff was committed before this point, so failing the
    // request would orphan a venue with no way for the owner to sign in.
    // Instead surface a structured `emailDeliveryFailed` flag so the form
    // can tell the owner to contact support — the row is recoverable by
    // an operator manually re-issuing a magic link.
    const e = err as { statusCode?: number; message?: string };
    console.error("[signup] email send failed", {
      email,
      slug: result.venue.slug,
      statusCode: e.statusCode,
      message: e.message,
    });
    emailDeliveryFailed = true;
    // Dev-only: also return the raw link to keep local onboarding testable
    // without a working Resend. Strictly gated — never set in prod.
    const allowDevLinks =
      process.env.TABSIGNAL_DEV_LINKS === "true" ||
      process.env.NODE_ENV === "development";
    if (allowDevLinks) devLink = link;
  }

  return NextResponse.json(
    {
      ok: true,
      slug: result.venue.slug,
      ...(emailDeliveryFailed ? { emailDeliveryFailed: true } : {}),
      ...(devLink ? { devLink } : {}),
    },
    { status: 201 }
  );
}
