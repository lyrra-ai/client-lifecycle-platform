/**
 * Email — the universal fallback channel (System Design §6) when a client
 * hasn't opted into WhatsApp. Provider (Resend/SendGrid, System Design §7)
 * wired here only, so feature code never imports a provider SDK directly.
 */
export interface SendEmailParams {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    throw new Error("EMAIL_PROVIDER_API_KEY not set — email sending not yet configured.");
  }
  throw new Error(`sendEmail() not yet implemented (to: ${params.to}).`);
}
