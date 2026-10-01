import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/integrations/razorpay";

/**
 * Razorpay webhook — the single source of truth that a payment happened
 * (System Design §3.1, §7). Must be idempotent and retry-safe: Razorpay
 * may redeliver the same event, and a dropped delivery is backstopped by
 * a reconciliation poll job (JOBS.RAZORPAY_RECONCILE, PRD §7).
 *
 * Never trust a client-side "payment done" click — this route is the only
 * place Invoice.status moves to "paid" and Engagement.stage advances from
 * deposit_invoiced to deposit_paid.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const rawBody = await req.text();

  if (!signature || !secret || !verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);

  // TODO: look up Payment by razorpayPaymentId (idempotency key) before
  // creating — a redelivered event must be a no-op, not a duplicate record.
  // TODO: on payment.captured, call services/billing to mark the Invoice
  // paid and services/engagement.advanceStageAutomatically(...).
  console.log("razorpay webhook event received", event?.event);

  return NextResponse.json({ received: true });
}
