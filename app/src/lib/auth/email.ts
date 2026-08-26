import { sendEmail } from "@/lib/email/send";

/**
 * The confirm-your-address email.
 *
 * Still named sendMagicLinkEmail because that's what every caller
 * imports, but it no longer sells itself as the way in: signing in is
 * email + password, and this link exists to prove the address belongs to
 * the person who typed it. Password sign-in refuses to mint a session
 * until that's settled, which is why a new owner has to tap it once.
 */
export async function sendMagicLinkEmail(opts: {
  to: string;
  staffName: string;
  venueName: string;
  link: string;
}) {
  const { to, staffName, venueName, link } = opts;
  const subject = `Confirm your email · TabCall · ${venueName}`;
  const text =
    `Hi ${staffName || "there"},\n\n` +
    `Tap the link below to confirm this address for ${venueName} on TabCall.\n` +
    `After that, sign in any time with your email and password.\n` +
    `The link expires in 15 minutes and can only be used once.\n\n` +
    `${link}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #34263F; background:#FBF8F2;">
      <tr><td style="padding: 24px;">
        <h2 style="margin: 0 0 12px; font-weight: 500;">Confirm your email</h2>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(staffName || "there")}, tap the button below to confirm this address for <strong>${escapeHtml(venueName)}</strong>. After that you sign in with your email and password.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#F4C95D;color:#34263F;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;display:inline-block;">Confirm my email</a>
        </p>
        <p style="margin: 0 0 8px;font-size:13px;color:#8B6F4E;">Or paste this link into your browser:</p>
        <p style="margin: 0 0 24px;font-size:13px;color:#8B6F4E;word-break:break-all;">${link}</p>
        <p style="margin: 0;font-size:12px;color:#8B6F4E;">This link expires in 15 minutes and is single-use. If you didn't request it, ignore this email.</p>
      </td></tr>
    </table>
  `.trim();
  return sendEmail({ to, subject, html, text });
}

/**
 * Staff-invite email. Distinct from the confirm-address email: different
 * subject ("You're invited…"), names the inviter and role, and reflects
 * the 7-day invite-token TTL instead of the 15-minute sign-in TTL.
 */
export async function sendStaffInviteEmail(opts: {
  to: string;
  staffName: string;
  venueName: string;
  inviterName?: string | null;
  role?: string | null;
  link: string;
}) {
  const { to, staffName, venueName, inviterName, role, link } = opts;
  const subject = `You're invited to join ${venueName} on TabCall`;
  const invitedBy = inviterName ? `${inviterName} invited you` : "You've been invited";
  const roleLine = role ? ` as ${role.charAt(0) + role.slice(1).toLowerCase()}` : "";
  const text =
    `Hi ${staffName || "there"},\n\n` +
    `${invitedBy} to join the ${venueName} team on TabCall${roleLine}.\n` +
    `Tap the link below to accept. You'll choose a password, and that's how\n` +
    `you sign in from then on.\n` +
    `The link is valid for 7 days and can only be used once.\n\n` +
    `${link}\n\n` +
    `If you weren't expecting this, you can ignore this email.`;
  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #34263F; background:#FBF8F2;">
      <tr><td style="padding: 24px;">
        <h2 style="margin: 0 0 12px; font-weight: 500;">Join ${escapeHtml(venueName)} on TabCall</h2>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(staffName || "there")}, ${escapeHtml(invitedBy.toLowerCase())} to the <strong>${escapeHtml(venueName)}</strong> team${escapeHtml(roleLine)}.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#F4C95D;color:#34263F;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;display:inline-block;">Accept invite &amp; set a password</a>
        </p>
        <p style="margin: 0 0 8px;font-size:13px;color:#8B6F4E;">Or paste this link into your browser:</p>
        <p style="margin: 0 0 24px;font-size:13px;color:#8B6F4E;word-break:break-all;">${link}</p>
        <p style="margin: 0;font-size:12px;color:#8B6F4E;">This invite is valid for 7 days and is single-use. If you weren't expecting it, ignore this email.</p>
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

/**
 * Password-reset email. Distinct from the magic-link sign-in email in
 * subject + body so the user can't confuse them — clicking a reset
 * link doesn't sign you in, it lands you on a "set new password" form.
 * Link expires in 1 hour and is single-use (DB-enforced via
 * PasswordResetToken.tokenHash unique constraint).
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  staffName: string;
  venueName: string;
  link: string;
}) {
  const { to, staffName, venueName, link } = opts;
  const subject = `Reset your TabCall password · ${venueName}`;
  const text =
    `Hi ${staffName || "there"},\n\n` +
    `Someone asked to reset the password on your TabCall account for ${venueName}.\n` +
    `Tap the link below to choose a new password. It expires in 1 hour and can only be used once.\n\n` +
    `${link}\n\n` +
    `If you didn't ask for this, you can safely ignore this email — your password won't change.`;
  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #34263F; background:#FBF8F2;">
      <tr><td style="padding: 24px;">
        <h2 style="margin: 0 0 12px; font-weight: 500;">Reset your TabCall password</h2>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(staffName || "there")}, someone asked to reset the password on your TabCall account for <strong>${escapeHtml(venueName)}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#F4C95D;color:#34263F;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;display:inline-block;">Choose a new password</a>
        </p>
        <p style="margin: 0 0 8px;font-size:13px;color:#8B6F4E;">Or paste this link into your browser:</p>
        <p style="margin: 0 0 24px;font-size:13px;color:#8B6F4E;word-break:break-all;">${link}</p>
        <p style="margin: 0 0 8px;font-size:12px;color:#8B6F4E;">This link expires in 1 hour and is single-use.</p>
        <p style="margin: 0;font-size:12px;color:#8B6F4E;">If you didn't ask for this, you can safely ignore this email — your password won't change.</p>
      </td></tr>
    </table>
  `.trim();
  return sendEmail({ to, subject, html, text });
}
