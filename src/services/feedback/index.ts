/**
 * Feedback Service (System Design §2) — owns FeedbackRequest,
 * FeedbackResponse, HandoverPacket. Talks to AIGateway (task:
 * "handover_summary"). Implements PRD §14 (Feedback & Handover).
 *
 * Triggered manually by the owner when delivery is complete — never
 * auto-triggered by a date (PRD §14), since real projects don't end on a
 * fixed schedule.
 */
export {};
