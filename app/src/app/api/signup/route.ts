import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { newQrToken } from "@/lib/qr";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { hashStaffPassword } from "@/lib/auth/staff-password";
import { isE164 } from "@/lib/countries";
import { appOrigin } from "@/lib/origin";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * Self-serve restaurant signup.
 *
 * Collects: restaurant name, full street address, E.164 phone +
 * ISO country code, email, password, terms acceptance.
 *
 * Creates Organization + Venue (with 6 default tables) + owner
 * StaffMember in one transaction. StaffMember.emailVerifiedAt is
 * left NULL — `/api/auth/login` refuses to mint a session until the
 * owner clicks the verification link sent here. The link routes
 * through `/api/auth/callback`, which sets emailVerifiedAt and
 * mints a session cookie, then redirects to the dashboard.
 *
 * Growth/Pro buyers don't come through here — they go through the
 * concierge "book a call" intercept on the billing page. This
 * endpoint is intentionally scoped to Starter only.
 */

const Body = z.object({
  restaurantName: z.string().min(1).max(120),
  address: z.string().min(5).max(240),
  // Server-validated as E.164 — the form composes it from country
  // dial-code + national-number. Direct API callers must send the
  // already-composed value.
  phoneNumber: z.string().refine(isE164, {
    message: "phoneNumber must be E.164 (e.g. +12125551234)",
  }),
  country: z.string().regex(/^[A-Z]{2}$/, "country must be ISO 3166-1 alpha-2 (e.g. US, GB)"),
  email: z.string().email().max(200),
  password: z.string().min(12).max(128),
  // Server-side terms gate. The form has a checkbox; without this a
  // direct POST could bypass it. Require literal `true`.
  agreeTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must agree to the Terms of Service and Privacy Policy",
    }),
  }),
});

// Default table count for self-serve venues. Owners can adjust from
// /admin/v/[slug]/qr-tents after launch.
const DEFAULT_TABLE_COUNT = 6;

// Spam guard: limit signups per IP. Upstash-backed via rateLimitAsync
// so the cap holds across Vercel cold starts.
const SIGNUPS_PER_HOUR = 5;

/**
 * Best-effort ZIP extraction from a free-text address string. The
 * tax-rate helper needs a ZIP; if we can't find one the venue still
 * works (tax falls back to a default rate) but receipts won't carry
 * the correct rate. Recognises US 5-digit and ZIP+4 patterns.
 */
function extractZip(address: string): string | null {
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(address);
  return m ? m[1] : null;
}

/** Infer a display name for the owner StaffMember row from the email
 *  local-part. The signup spec doesn't collect a name field; the row
 *  still needs one because team-invite UIs render it everywhere.
 *  Capitalises the first letter so "owner@luna" → "Owner". */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

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
  // venue. Send a sign-in link instead so they can recover access.
  // Response shape stays identical to a fresh signup so we don't
  // enumerate registered emails.
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
    return NextResponse.json({
      ok: true,
      alreadyRegistered: true,
      ...(existingEmailFailed ? { emailDeliveryFailed: true } : {}),
    });
  }

  // Slug from restaurant name; collision-suffix if taken.
  let slug = slugify(parsed.restaurantName);
  if (await db.venue.findUnique({ where: { slug } })) {
    slug = `${slug}-${newQrToken().slice(0, 4).toLowerCase()}`;
  }

  // Hash the password OUTSIDE the transaction — bcrypt at cost 12
  // takes ~250ms and we don't want to hold a DB connection idle.
  let passwordHash: string;
  try {
    passwordHash = await hashStaffPassword(parsed.password);
  } catch (err) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: err instanceof Error ? err.message : "password failed validation" },
      { status: 400 },
    );
  }

  const zipCode = extractZip(parsed.address);
  const ownerName = nameFromEmail(email);

  // Single transaction: org + venue + tables + owner staff. If
  // anything fails we don't want a half-created venue.
  const result = await db.$transaction(async tx => {
    const org = await tx.organization.create({
      data: {
        name: parsed.restaurantName,
        venues: {
          create: {
            slug,
            name: parsed.restaurantName,
            address: parsed.address,
            phoneNumber: parsed.phoneNumber,
            country: parsed.country,
            ...(zipCode ? { zipCode } : {}),
            tables: {
              create: Array.from({ length: DEFAULT_TABLE_COUNT }, (_, i) => ({
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

    // Explicit role='OWNER': the column default was 'STAFF' (legacy)
    // until 20260511 migration flipped it to 'SERVER'. Either default
    // is wrong for the venue creator — they need manager permissions
    // to invite staff, configure Stripe, and edit settings.
    const staff = await tx.staffMember.create({
      data: {
        venueId: venue.id,
        email,
        name: ownerName,
        role: "OWNER",
        passwordHash,
        passwordChangedAt: new Date(),
        // emailVerifiedAt deliberately left NULL — set by
        // /api/auth/callback when the user clicks the verification
        // link. Password login refuses to mint a session until then.
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

  // Mint a magic-link for email verification. Clicking it routes the
  // owner to the dashboard with a session cookie set + emailVerifiedAt
  // stamped, so they can subsequently log in with email+password.
  const token = await signLinkToken({
    kind: "link",
    staffId: result.staffId,
    email,
    next: `/admin/v/${result.venue.slug}`,
  });
  const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;

  let devLink: string | null = null;
  let emailDeliveryFailed = false;
  try {
    await sendMagicLinkEmail({
      to: email,
      staffName: ownerName,
      venueName: result.venue.name,
      link,
    });
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    console.error("[signup] verification email send failed", {
      email,
      slug: result.venue.slug,
      statusCode: e.statusCode,
      message: e.message,
    });
    emailDeliveryFailed = true;
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
