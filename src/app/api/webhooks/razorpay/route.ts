import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/integrations/razorpay";
import { recordPaymentFromRazorpay } from "@/services/billing";

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

  if (event.event === "payment.captured") {
    const entity = event.payload.payment.entity;
    await recordPaymentFromRazorpay({
      id: entity.id,
      order_id: entity.order_id,
      amount: entity.amount,
      method: entity.method,
      created_at: entity.created_at,
      status: entity.status,
    });
  }
  // Any other event type is a no-op here, by design — acknowledged so
  // Razorpay doesn't retry it as if it were dropped.

  return NextResponse.json({ received: true });
}
