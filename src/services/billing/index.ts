/**
 * Billing Service (System Design §2) — owns Invoice, Payment, TaxLine
 * (GST breakup stored as Invoice.gstBreakup jsonb). Talks to Razorpay only
 * — billing math is deterministic, no AI involvement. Implements PRD §6
 * (Deposit/Milestone Invoice) and §7 (Payment Collection).
 *
 * The Razorpay webhook handler (src/app/api/webhooks/razorpay) is the only
 * caller allowed to mark an Invoice paid and advance the Engagement stage
 * — never a manual "mark as paid" click (System Design §3.1, PRD §7).
 */
export {};
