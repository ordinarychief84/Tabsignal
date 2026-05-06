import { Resend } from "resend";

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(args: SendArgs): Promise<{ id: string | null }> {
  const from = process.env.RESEND_FROM ?? "alerts@tabcall.app";
  const result = await getClient().emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo,
  });
  // Resend's SDK resolves with { data, error } instead of throwing on
  // delivery failure (unverified domain, sandbox sender, free-tier limit).
  // Caller-visible error semantics matter — upstream code uses try/catch
  // to fall back to a devLink. Promote `error` into a real throw.
  if (result.error) {
    const code = (result.error as { name?: string }).name ?? "RESEND_ERROR";
    const msg = (result.error as { message?: string }).message ?? "send failed";
    const err = new Error(`${code}: ${msg}`);
    (err as { statusCode?: number }).statusCode = (result.error as { statusCode?: number }).statusCode;
    throw err;
  }
  return { id: result.data?.id ?? null };
}
