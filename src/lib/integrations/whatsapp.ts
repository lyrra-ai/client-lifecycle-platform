/**
 * WhatsApp Business API integration (System Design §7) — preferred channel
 * where the client has opted in (PRD §12). Provider (Gupshup, 360dialog,
 * etc.) is an open question (PRD §17) deferred to implementation time;
 * this module is the one place that choice gets wired in, so callers
 * never depend on a specific provider's SDK.
 *
 * Requires business verification lead time — a setup task, not a
 * same-day integration (System Design §7).
 */
export interface SendWhatsAppMessageParams {
  tenantId: string;
  toPhone: string;
  body: string;
}

export async function sendWhatsAppMessage(params: SendWhatsAppMessageParams): Promise<void> {
  if (!process.env.WHATSAPP_PROVIDER_API_KEY) {
    throw new Error("WHATSAPP_PROVIDER_API_KEY not set — WhatsApp sending not yet configured.");
  }
  throw new Error(`sendWhatsAppMessage() not yet implemented (to: ${params.toPhone}).`);
}
