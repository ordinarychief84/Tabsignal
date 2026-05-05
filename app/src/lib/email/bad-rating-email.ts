import type { Classification } from "@/lib/ai/classify-feedback";

export type BadRatingArgs = {
  venueName: string;
  tableLabel: string;
  rating: number;
  note: string | null;
  classification: Classification;
  occurredAt: Date;
  staffQueueUrl: string;
};

export function badRatingSubject(args: BadRatingArgs): string {
  return `[TabCall] ${args.tableLabel} · ${args.rating}★ · ${labelFor(args.classification.category)}`;
}

export function badRatingHtml(args: BadRatingArgs): string {
  const time = args.occurredAt.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", weekday: "short" });
  const noteLine = args.note?.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;background:#FFF7ED;border-left:3px solid #F59E0B;font-style:italic;color:#7C2D12;">"${escapeHtml(args.note.trim())}"</p>`
    : `<p style="margin:16px 0;color:#64748B;">No note provided.</p>`;

  const serverLine = args.classification.serverName
    ? `<p style="margin:0;color:#475569;"><strong>Staff named:</strong> ${escapeHtml(args.classification.serverName)}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0F172A;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 0;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
          <tr><td style="padding:24px 28px;border-bottom:1px solid #E2E8F0;">
            <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748B;">${escapeHtml(args.venueName)} · ${escapeHtml(time)}</p>
            <h1 style="margin:6px 0 0;font-size:20px;color:#0F172A;">${escapeHtml(args.tableLabel)} · ${args.rating}★</h1>
          </td></tr>
          <tr><td style="padding:20px 28px;">
            ${noteLine}
            <p style="margin:0;color:#475569;"><strong>Likely cause:</strong> ${labelFor(args.classification.category)} <span style="color:#94A3B8;font-size:12px;">· ${args.classification.confidence} confidence</span></p>
            ${serverLine}
            <p style="margin:14px 0 0;color:#0F172A;"><strong>Suggested action:</strong> ${escapeHtml(args.classification.suggestion)}</p>
          </td></tr>
          <tr><td style="padding:18px 28px 24px;border-top:1px solid #E2E8F0;background:#F8FAFC;">
            <a href="${escapeHtml(args.staffQueueUrl)}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">Open live queue</a>
            <p style="margin:14px 0 0;font-size:11px;color:#94A3B8;line-height:1.5;">
              AI-generated suggestion — verify before acting. Classification can be wrong; the guest's words matter more than the category.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function badRatingText(args: BadRatingArgs): string {
  const lines: string[] = [];
  lines.push(`${args.venueName} — ${args.tableLabel} — ${args.rating} stars`);
  lines.push(args.occurredAt.toLocaleString());
  lines.push("");
  lines.push(args.note?.trim() ? `"${args.note.trim()}"` : "(no note)");
  lines.push("");
  lines.push(`Likely cause: ${labelFor(args.classification.category)} (${args.classification.confidence})`);
  if (args.classification.serverName) lines.push(`Staff named: ${args.classification.serverName}`);
  lines.push(`Suggested action: ${args.classification.suggestion}`);
  lines.push("");
  lines.push(`Live queue: ${args.staffQueueUrl}`);
  lines.push("");
  lines.push("AI-generated. Verify before acting.");
  return lines.join("\n");
}

function labelFor(c: Classification["category"]): string {
  switch (c) {
    case "service_speed":  return "Service speed";
    case "drink_quality":  return "Drink quality";
    case "staff_attitude": return "Staff attitude";
    case "wait_time":      return "Wait time";
    case "food":           return "Food";
    case "noise":          return "Noise / ambience";
    case "other":          return "Other";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
