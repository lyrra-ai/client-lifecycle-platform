/**
 * Email — the universal fallback channel (System Design §6) when a client
 * hasn't opted into WhatsApp. Resend is the only place that SDK is
 * imported, so feature code never depends on a specific provider.
 */
import { Resend } from "resend";

export interface SendEmailParams {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
}

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    client = new Resend(process.env.EMAIL_PROVIDER_API_KEY);
  }
  return client;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    throw new Error("EMAIL_PROVIDER_API_KEY not set — email sending not yet configured.");
  }

  // Resend's shared test domain works with no sending-domain verification —
  // the right default for a pre-revenue tenant that hasn't verified their
  // own domain yet. Override with EMAIL_FROM_ADDRESS once one is verified.
  const from = process.env.EMAIL_FROM_ADDRESS || "onboarding@resend.dev";

  const result = await getClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
}
