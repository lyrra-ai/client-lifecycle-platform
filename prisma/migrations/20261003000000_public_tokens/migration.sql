-- Opaque public tokens for every client-facing link, so the raw database id
-- is never exposed in a URL. Nullable first, backfilled with a random
-- value (core gen_random_uuid(), no extension needed on PG13+), then made
-- NOT NULL + unique. New rows set this at creation time in application code.

ALTER TABLE "engagements" ADD COLUMN "publicToken" TEXT;
UPDATE "engagements" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "engagements" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "engagements_publicToken_key" ON "engagements"("publicToken");

ALTER TABLE "proposals" ADD COLUMN "publicToken" TEXT;
UPDATE "proposals" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "proposals" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "proposals_publicToken_key" ON "proposals"("publicToken");

ALTER TABLE "invoices" ADD COLUMN "publicToken" TEXT;
UPDATE "invoices" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "invoices" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "invoices_publicToken_key" ON "invoices"("publicToken");

ALTER TABLE "welcome_docs" ADD COLUMN "publicToken" TEXT;
UPDATE "welcome_docs" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "welcome_docs" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "welcome_docs_publicToken_key" ON "welcome_docs"("publicToken");

ALTER TABLE "intake_forms" ADD COLUMN "publicToken" TEXT;
UPDATE "intake_forms" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "intake_forms" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "intake_forms_publicToken_key" ON "intake_forms"("publicToken");

ALTER TABLE "kickoff_calls" ADD COLUMN "publicToken" TEXT;
UPDATE "kickoff_calls" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "kickoff_calls" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "kickoff_calls_publicToken_key" ON "kickoff_calls"("publicToken");

ALTER TABLE "feedback_requests" ADD COLUMN "publicToken" TEXT;
UPDATE "feedback_requests" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "feedback_requests" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "feedback_requests_publicToken_key" ON "feedback_requests"("publicToken");

ALTER TABLE "handover_packets" ADD COLUMN "publicToken" TEXT;
UPDATE "handover_packets" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "publicToken" IS NULL;
ALTER TABLE "handover_packets" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "handover_packets_publicToken_key" ON "handover_packets"("publicToken");
