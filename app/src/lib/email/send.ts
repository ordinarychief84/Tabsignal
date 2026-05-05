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
  return { id: result.data?.id ?? null };
}
