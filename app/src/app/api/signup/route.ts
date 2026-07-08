import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { newQrToken } from "@/lib/qr";
import { signInviteToken, signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { hashStaffPassword } from "@/lib/auth/staff-password";
import {
  verifyOauthPending,
  readCookie,
  OAUTH_PENDING_COOKIE,
  clearedCookieOptions,
} from "@/lib/auth/oauth-google";
import { isE164 } from "@/lib/countries";
import { appOrigin } from "@/lib/origin";
import { rateLimitAsync } from "@/lib/rate-limit";
import { PLATFORM_TRIAL_DAYS } from "@/lib/plans";

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
  // Owner's full name — separate from restaurantName so we can address
  // emails ("Hi Sam Owner") + populate StaffMember.name accurately
  // instead of inferring from the email local-part.
  ownerName: z.string().trim().min(1, "ownerName is required").max(120),
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
  // Optional at the schema level so the OAuth path (identity already
  // Google-verified) can omit it. When there is NO valid oauth-pending
  // cookie, the handler enforces password-required — the non-OAuth
  // contract is unchanged.
  password: z.string().min(12).max(128).optional(),
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
//
// Was 5/hour during the original launch — too tight in practice. A
// single demo session at a sales meeting (founder showing the product
// to multiple prospects from one office IP) burned the budget and
// locked the IP out for an hour. 50/hour preserves the spam guard
// against scripted abuse while leaving comfortable headroom for
// legitimate demo + multi-restaurant onboarding patterns from a
// shared NAT. Tune higher if a real abuse pattern shows up in logs.
const SIGNUPS_PER_HOUR = 50;

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

  // OAuth signup handoff: a valid oauth-pending cookie (set by the Google
  // callback for an unknown email) makes password optional and the
  // account born email-verified + provider-linked. The cookie email must
  // match the submitted email, else we treat it as a normal signup
  // (password required) — no trusting a stale/foreign pending cookie.
  const pendingCookie = readCookie(req, OAUTH_PENDING_COOKIE);
  const oauthPending = pendingCookie ? await verifyOauthPending(pendingCookie) : null;
  const isOauthSignup = !!oauthPending && oauthPending.email.toLowerCase() === email;

  if (!isOauthSignup && !parsed.password) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: "password: Required (min 12 chars)" },
      { status: 400 },
    );
  }

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
  // takes ~250ms and we don't want to hold a DB connection idle. OAuth
  // signups carry no password (Google is the credential).
  let passwordHash: string | null = null;
  if (!isOauthSignup) {
    try {
      passwordHash = await hashStaffPassword(parsed.password!);
    } catch (err) {
      return NextResponse.json(
        { error: "INVALID_BODY", detail: err instanceof Error ? err.message : "password failed validation" },
        { status: 400 },
      );
    }
  }

  const zipCode = extractZip(parsed.address);
  // Use the explicit ownerName from the form. Legacy callers (none
  // currently, but defensive) that omit it fall back to the email
  // local-part so we never persist an empty `name`.
  const ownerName = parsed.ownerName.trim() || nameFromEmail(email);

  // Single transaction: org + venue + tables + owner staff. If
  // anything fails we don't want a half-created venue.
  const result = await db.$transaction(async tx => {
    const org = await tx.organization.create({
      data: {
        name: parsed.restaurantName,
        // Card-less platform trial: full Growth features for the first
        // PLATFORM_TRIAL_DAYS. planFromOrg() downgrades to free lazily
        // when trialEndsAt passes; a real Stripe subscription (webhook)
        // overwrites both fields when they upgrade.
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + PLATFORM_TRIAL_DAYS * 86_400_000),
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
    // Explicit role='OWNER': the column default was 'STAFF' (legacy)
    // until 20260511 migration flipped it to 'SERVER'. Either default
    // is wrong for the venue creator — they need manager permissions
    // to invite staff, configure Stripe, and edit settings.
    //
    // OAuth signups are born email-verified (Google asserted it) and
    // carry no password; magic-link signups leave both null until the
    // owner clicks their verification link.
    const staff = await tx.staffMember.create({
      data: {
        venueId: venue.id,
        email,
        name: ownerName,
        role: "OWNER",
        passwordHash,
        // OAuth: emailVerifiedAt now; magic-link: passwordChangedAt now.
        // carry no password; the magic-link path leaves both null until
        // the owner clicks their verification link.
        ...(isOauthSignup
          ? { emailVerifiedAt: new Date() }
          : { passwordChangedAt: new Date() }),
      },
    });
    // Link the federated identity so the next Google sign-in resolves
    // directly (no email-match fallback needed).
    if (isOauthSignup && oauthPending) {
      await tx.authIdentity.create({
        data: { provider: "google", subject: oauthPending.sub, staffId: staff.id, email },
      });
    }
    await tx.orgMember.create({
      data: {
        orgId: org.id,
        email,
        role: "OWNER",
      },
    });

    return { orgId: org.id, venue, staffId: staff.id };
  });

  // OAuth signup: account is already verified + provider-linked, so skip
  // the magic-link verification email entirely and clear the pending
  // cookie. The owner is returned to /signup which shows success and can
  // "Continue with Google" straight into the session.
  if (isOauthSignup) {
    const res = NextResponse.json({ ok: true, slug: result.venue.slug }, { status: 201 });
    res.cookies.set(OAUTH_PENDING_COOKIE, "", clearedCookieOptions());
    return res;
  }

  // Mint a magic-link for email verification. Clicking it routes the
  // owner to the onboarding launchpad with a session cookie set +
  // emailVerifiedAt stamped, so they can subsequently log in with
  // email+password. The launchpad walks brand → QRs → team → payments
  // → go-live; progress persists server-side on the venue row.
  //
  // 7-day TTL (signInviteToken), not the 15-minute sign-in TTL: owners
  // routinely sign up mid-shift and open the email hours later. Still
  // single-use via the jti burn in /api/auth/callback.
  const token = await signInviteToken({
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
