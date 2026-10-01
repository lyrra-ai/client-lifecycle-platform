/**
 * Proposal Service (System Design §2) — owns Proposal, ProposalLineItem,
 * EsignEvent. Talks to the OTP provider and AIGateway (task: "proposal_draft").
 * Implements PRD §4 (Quote/Proposal Builder) and §5 (E-sign).
 *
 * Follow the pattern in src/services/engagement/index.ts: every exported
 * function takes a TenantContext first and uses withTenant() for all
 * Prisma queries.
 */
export {};
