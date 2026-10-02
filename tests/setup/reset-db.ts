import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Explicit table list (rather than relying on CASCADE reaching tables not
// named here) so adding a model without updating this list fails loudly
// the next time a test touches that table, instead of silently leaking
// rows between tests.
const TABLES = [
  "sessions",
  "otp_codes",
  "follow_up_tasks",
  "follow_up_rules",
  "feedback_responses",
  "feedback_requests",
  "handover_packets",
  "call_summaries",
  "kickoff_calls",
  "access_requests",
  "intake_responses",
  "intake_forms",
  "welcome_docs",
  "payments",
  "invoices",
  "esign_events",
  "proposal_line_items",
  "proposals",
  "engagement_stage_logs",
  "engagements",
  "leads",
  "clients",
  "users",
  "tenants",
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});
