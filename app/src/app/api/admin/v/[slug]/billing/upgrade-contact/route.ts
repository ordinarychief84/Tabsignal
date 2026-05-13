import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { can } from "@/lib/auth/permissions";

const Body = z.object({
  plan: z.enum(["growth", "pro"]),
  phone: z.string().max(40).optional(),
  availability: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Concierge intercept for Growth/Pro upgrades. Sends an email to the
 * TabCall founder list (OPERATOR_EMAILS) with the venue's request.
 *
 * Always returns 200 so the UI can show a confirmation — Resend errors
 * are logged but don't block the user (the request still lands in the
 * server logs / DB if we add persistence later).
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, name: true, slug: true, org: { select: { id: true, name: true } } },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // Concierge upgrade emails commit a manager to a sales conversation —
  // gate behind billing.view (anyone Manager-or-Owner) to filter out
  // SERVER-curiosity clicks before they reach the founder inbox.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "billing.view")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't request an upgrade." },
      { status: 403 }
    );
  }

  const operators = (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const operatorTo = operators.length > 0 ? operators : ["hello@tabcall.app"];

  const planLabel = parsed.plan === "pro" ? "Pro ($299/mo)" : "Growth ($99/mo)";
  const subject = `[Onboard] ${venue.name} · wants ${planLabel}`;
  const text =
    `${venue.name} (${venue.slug}) wants to upgrade.\n` +
    `Org: ${venue.org.name} (${venue.org.id})\n` +
    `Plan: ${planLabel}\n` +
    `Requested by: ${session.email}${parsed.phone ? ` · ${parsed.phone}` : ""}\n\n` +
    (parsed.availability ? `Availability: ${parsed.availability}\n\n` : "") +
    (parsed.notes ? `Notes:\n${parsed.notes}\n\n` : "") +
    `Reply to this email to start the thread, or jump in the operator console:\n` +
    `https://www.tab-call.com/operator/orgs/${venue.org.id}\n`;
  const html = `
    <h2 style="font-family: -apple-system, sans-serif;">${escapeHtml(venue.name)} · wants ${escapeHtml(planLabel)}</h2>
    <p style="font-family: -apple-system, sans-serif;">
      Org: <strong>${escapeHtml(venue.org.name)}</strong>
      (<code>${venue.org.id}</code>)<br>
      Venue slug: <code>${venue.slug}</code><br>
      Requested by: <strong>${escapeHtml(session.email)}</strong>${parsed.phone ? ` · ${escapeHtml(parsed.phone)}` : ""}
    </p>
    ${parsed.availability ? `<p><strong>Availability:</strong><br>${escapeHtml(parsed.availability).replace(/\n/g, "<br>")}</p>` : ""}
    ${parsed.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(parsed.notes).replace(/\n/g, "<br>")}</p>` : ""}
    <p>
      <a href="https://www.tab-call.com/operator/orgs/${venue.org.id}">Open in operator console →</a>
    </p>
  `.trim();

  try {
    await sendEmail({
      to: operatorTo,
      subject,
      html,
      text,
      replyTo: session.email,
    });
  } catch (err) {
    // Don't block the user; the founder will see this in app logs.
    console.warn("[upgrade-contact] email send failed", err);
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
