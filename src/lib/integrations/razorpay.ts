import Razorpay from "razorpay";

/**
 * Razorpay is the ONLY path that touches payments (System Design §7).
 * PCI-DSS scope stays entirely with Razorpay — this platform never builds
 * its own card-entry form and never stores raw card data.
 *
 * Webhook handling (src/app/api/webhooks/razorpay) must be idempotent and
 * retry-safe (System Design §7 non-functional requirements) — a missed
 * webhook means an unrecorded payment, which is the one unacceptable
 * failure mode regardless of overall uptime target.
 */

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (client) return client;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set.");
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
}

/**
 * Verify a Razorpay webhook signature before trusting any payload
 * (System Design §7 — never trust a client-side "payment done" click,
 * and the same discipline applies to the webhook itself).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
