/**
 * Kickoff Service (System Design §2) — owns KickoffCall, CallSummary,
 * ActionItem (stored as CallSummary.actionItems jsonb). Talks to AIGateway
 * and Calendar (ICS generation v1; Google/Outlook OAuth is v2, PRD §16).
 * Implements PRD §11 (Kickoff Call).
 */
export {};
