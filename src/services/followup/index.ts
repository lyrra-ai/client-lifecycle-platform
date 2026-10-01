/**
 * Follow-up Engine (System Design §6) — owns FollowUpTask, FollowUpRule.
 * The single most important automation in the product: one engine covers
 * proposals, invoices, intake forms, and access requests, not four
 * separate reminder systems. Implements PRD §12.
 *
 * FollowUpTask is created automatically whenever a target enters a
 * "waiting on client" state and cancelled automatically the moment that
 * state changes (System Design §6) — this logic belongs here, triggered
 * by the owning service (Proposal/Billing/Onboarding), not duplicated in
 * each of them.
 *
 * Nudges are always a draft to approve (System Design §1 principle 3) —
 * this service never sends a message itself; it enqueues AI_DRAFT_GENERATE
 * jobs (src/lib/queue) and leaves sending to an explicit owner action.
 */
export {};
