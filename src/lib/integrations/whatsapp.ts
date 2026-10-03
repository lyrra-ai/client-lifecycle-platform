/**
 * WhatsApp Business API integration (System Design §7) — preferred channel
 * where the client has opted in (PRD §12). Provider decision (PROGRESS.md
 * iteration 17): direct Meta Cloud API, no BSP — cost difference vs.
 * Gupshup/360dialog was negligible, direct avoids a third-party dependency.
 *
 * Business-initiated messages (kickoff reminders, follow-ups, payment
 * nudges — this app's core use case) must use a pre-approved message
 * template; Meta rejects free-form text outside a 24h customer-service
 * window. Callers pass the template name + ordered body variables.
 */
const GRAPH_API_VERSION = "v21.0";

export interface SendWhatsAppMessageParams {
  tenantId: string;
  toPhone: string;
  templateName: string;
  languageCode?: string;
  templateParams?: string[];
}

export async function sendWhatsAppMessage(params: SendWhatsAppMessageParams): Promise<void> {
  const token = process.env.WHATSAPP_PROVIDER_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "WHATSAPP_PROVIDER_API_KEY / WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp sending not yet configured."
    );
  }

  // Meta expects digits only (country code + number, no "+"/spaces/dashes) —
  // Client.phone is free-text input, so normalize rather than trust it.
  const toPhone = params.toPhone.replace(/[^0-9]/g, "");

  const body = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode ?? "en_US" },
      ...(params.templateParams && params.templateParams.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: params.templateParams.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${errorBody}`);
  }
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header on an inbound webhook POST —
 * same HMAC-over-raw-body pattern as Razorpay's webhook
 * (src/lib/integrations/razorpay.ts's verifyWebhookSignature), keyed by the
 * app secret (Meta App Dashboard → Settings → Basic → App Secret) rather
 * than the system-user API token used for sending.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
