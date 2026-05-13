import { sendEmail } from "@/lib/email/send";

export async function sendMagicLinkEmail(opts: {
  to: string;
  staffName: string;
  venueName: string;
  link: string;
}) {
  const { to, staffName, venueName, link } = opts;
  const subject = `Sign in to TabCall · ${venueName}`;
  const text =
    `Hi ${staffName || "there"},\n\n` +
    `Tap the link below to sign in to the TabCall staff app for ${venueName}.\n` +
    `This link expires in 15 minutes and can only be used once.\n\n` +
    `${link}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #232130; background:#F7F5F2;">
      <tr><td style="padding: 24px;">
        <h2 style="margin: 0 0 12px; font-weight: 500;">Sign in to TabCall</h2>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(staffName || "there")}, tap the button below to open the staff app for <strong>${escapeHtml(venueName)}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#F2E7B7;color:#232130;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;display:inline-block;">Open the staff app</a>
        </p>
        <p style="margin: 0 0 8px;font-size:13px;color:#8B6F4E;">Or paste this link into your browser:</p>
        <p style="margin: 0 0 24px;font-size:13px;color:#8B6F4E;word-break:break-all;">${link}</p>
        <p style="margin: 0;font-size:12px;color:#8B6F4E;">This link expires in 15 minutes and is single-use. If you didn't request it, ignore this email.</p>
      </td></tr>
    </table>
  `.trim();
  return sendEmail({ to, subject, html, text });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
