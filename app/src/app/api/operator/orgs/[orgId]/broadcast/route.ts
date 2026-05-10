import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";
import { sendEmail } from "@/lib/email/send";
import { orgAlertRecipients } from "@/lib/email/recipients";

const Body = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});

// Org-wide manager notice. Fans out to every venue's alert recipients
// (Venue.alertEmails → staff → OrgMembers fallback) via Resend, single
// email with multiple recipients.
export async function POST(req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });
  if (!canBroadcast(access.role)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Broadcast requires OWNER or ADMIN." }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const [org, venues, recipients] = await Promise.all([
    db.organization.findUnique({ where: { id: ctx.params.orgId }, select: { name: true } }),
    db.venue.findMany({ where: { orgId: ctx.params.orgId }, select: { id: true, name: true } }),
    orgAlertRecipients(ctx.params.orgId),
  ]);
  if (!org) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  console.info(
    `[broadcast] org=${ctx.params.orgId} by=${session?.email ?? "?"} ` +
    `subject="${parsed.subject}" venues=${venues.length} recipients=${recipients.length}`
  );

  const subjectPrefix = `[${org.name}] `;
  const subject = parsed.subject.startsWith("[") ? parsed.subject : subjectPrefix + parsed.subject;

  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#0E0F1A;background:#F8F6F1;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8B6F4E;">${escapeHtml(org.name)} · ${venues.length} venue${venues.length === 1 ? "" : "s"}</p>
        <h2 style="margin:0 0 16px;font-weight:500;">${escapeHtml(parsed.subject)}</h2>
        <div style="font-size:14px;color:#0E0F1A;white-space:pre-wrap;">${escapeHtml(parsed.body).replace(/\n/g, "<br>")}</div>
        <p style="margin:24px 0 0;font-size:12px;color:#8B6F4E;">
          Sent by ${escapeHtml(session?.email ?? "operator")} via the TabCall operator console.
        </p>
      </td></tr>
    </table>
  `.trim();

  const text =
    `${org.name} — ${parsed.subject}\n\n` +
    `${parsed.body}\n\n` +
    `(Broadcast sent by ${session?.email ?? "operator"}.)`;

  let delivered = 0;
  let bounced = 0;
  if (recipients.length > 0) {
    try {
      await sendEmail({
        to: recipients,
        subject,
        html,
        text,
        replyTo: session?.email,
      });
      delivered = recipients.length;
    } catch (err) {
      console.warn("[broadcast] sendEmail failed", err);
      bounced = recipients.length;
    }
  }

  return NextResponse.json({
    sent: true,
    reachedVenueCount: venues.length,
    deliveredCount: delivered,
    bouncedCount: bounced,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
