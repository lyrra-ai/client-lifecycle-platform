/**
 * Portal Service (System Design §2) — read-only aggregation across every
 * entity tied to one Engagement, for the client-facing portal
 * (PRD §13). Creates no new data of its own and talks to nothing external
 * — a live read, never a periodically-regenerated snapshot.
 */
export {};
