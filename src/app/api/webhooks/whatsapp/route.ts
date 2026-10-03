import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/integrations/whatsapp";

/**
 * WhatsApp Business API webhook (System Design §7, PROGRESS.md iteration
 * 17's deferred TODO). Two Meta-defined request shapes on one URL:
 *
 * GET  — the one-time verification handshake Meta performs when this URL
 *        is registered in the App Dashboard (WhatsApp → Configuration →
 *        Webhook). Must echo back `hub.challenge` iff `hub.verify_token`
 *        matches our configured secret.
 * POST — delivery/read-receipt status updates and inbound replies, sent
 *        for the life of the subscription. Signed with `X-Hub-Signature-256`
 *        (HMAC-SHA256 over the raw body, keyed by the Meta app secret) —
 *        same verify-then-trust discipline as the Razorpay webhook
 *        (src/app/api/webhooks/razorpay/route.ts), never trust an
 *        unsigned payload.
 *
 * Scope note: this only logs what it receives for now — no DB model exists
 * yet to persist delivery status against a sent message, and no inbound-
 * reply handling exists (both are real future work, not done here). What
 * this unblocks: local/live testing of the signature verification and
 * handshake mechanics ahead of building the persistence layer, per the
 * user's explicit ask to get the webhook itself working first.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = await req.text();

  if (!signature || !appSecret || !verifyWebhookSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const payload = JSON.parse(rawBody);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const status of value.statuses ?? []) {
        console.log(`[whatsapp webhook] message ${status.id} -> ${status.status} (recipient ${status.recipient_id})`);
      }
      for (const message of value.messages ?? []) {
        console.log(`[whatsapp webhook] inbound message from ${message.from}: ${message.text?.body ?? `[${message.type}]`}`);
      }
    }
  }

  // Acknowledge unconditionally once signature-verified, same reasoning as
  // the Razorpay webhook: an unrecognized event type is a no-op, not an
  // error, so Meta doesn't retry it as if delivery had failed.
  return NextResponse.json({ received: true });
}
