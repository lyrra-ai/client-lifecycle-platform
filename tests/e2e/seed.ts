/**
 * Seeds a real "sent" invoice with a real Razorpay order, directly via our
 * service layer against the dev database — same pattern as the Vitest
 * integration tests' factories, but against the real dev DB rather than
 * the isolated Vitest test DB, since these specs drive a real dev server.
 */
import { prisma } from "../../src/lib/db";
import { TenantContext } from "../../src/lib/tenant";
import { getOrCreateDraftProposal, updateDraftProposal, getPublicProposal } from "../../src/services/proposal";
import { autoCreateDepositInvoices, sendInvoice, createRazorpayOrderForInvoice } from "../../src/services/billing";
import { generatePublicToken } from "../../src/lib/public-token";

export async function seedSentInvoiceWithRealOrder(amountMajor = 50) {
  const tenant = await prisma.tenant.create({ data: { businessName: "Playwright E2E Co" } });
  const ctx = new TenantContext(tenant.id);
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Playwright Client", email: "playwright-e2e@example.com" },
  });
  const engagement = await prisma.engagement.create({
    data: { tenantId: tenant.id, clientId: client.id, stage: "proposal_accepted", publicToken: generatePublicToken() },
  });

  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [{ description: "E2E test item", qty: 1, unitPrice: amountMajor, currency: "INR" }],
  });
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "sent" } });
  await getPublicProposal(draft.publicToken);
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "accepted" } });

  const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
  await sendInvoice(ctx, invoice!.id);
  const order = await createRazorpayOrderForInvoice(invoice!.publicToken);

  return { tenantId: tenant.id, engagementId: engagement.id, invoiceId: invoice!.id, invoicePublicToken: invoice!.publicToken, order };
}

/** A sent proposal that's been viewed once (status "viewed") — the state getEsignContext requires to be signable. */
export async function seedViewedProposal(amountMajor = 500) {
  const tenant = await prisma.tenant.create({ data: { businessName: "Playwright E2E Co" } });
  const ctx = new TenantContext(tenant.id);
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Playwright Client", email: "playwright-e2e@example.com" },
  });
  const engagement = await prisma.engagement.create({
    data: { tenantId: tenant.id, clientId: client.id, stage: "lead", publicToken: generatePublicToken() },
  });

  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [{ description: "E2E e-sign test item", qty: 1, unitPrice: amountMajor, currency: "INR" }],
  });
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "sent" } });
  await getPublicProposal(draft.publicToken); // flips status -> "viewed"

  return { tenantId: tenant.id, engagementId: engagement.id, proposalId: draft.id, proposalPublicToken: draft.publicToken };
}

/**
 * FK cascade isn't configured, so this is a manual children-before-parents
 * cleanup — dev DB, not the isolated Vitest test DB, so leftover rows are
 * harmless, but tidying up keeps repeated local runs from accumulating
 * junk. Covers every table that can hang off an engagement, not just the
 * ones a given seed helper directly creates — a real payment going through
 * (payment.spec.ts) auto-creates a WelcomeDoc + IntakeForm as a side effect
 * (PRD §8/§9), so cleanup has to handle those too even though no seed
 * helper here creates them directly. Same dependency order as
 * tests/setup/reset-db.ts's TABLES list, scoped to this one tenant instead
 * of a blanket TRUNCATE.
 */
export async function cleanupTenant(tenantId: string) {
  const engagements = await prisma.engagement.findMany({ where: { tenantId }, select: { id: true } });
  const engagementIds = engagements.map((e) => e.id);
  const proposals = await prisma.proposal.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const proposalIds = proposals.map((p) => p.id);
  const invoices = await prisma.invoice.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const invoiceIds = invoices.map((i) => i.id);
  const intakeForms = await prisma.intakeForm.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const intakeFormIds = intakeForms.map((f) => f.id);
  const kickoffCalls = await prisma.kickoffCall.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const kickoffCallIds = kickoffCalls.map((k) => k.id);
  const feedbackRequests = await prisma.feedbackRequest.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const feedbackRequestIds = feedbackRequests.map((f) => f.id);

  await prisma.feedbackResponse.deleteMany({ where: { feedbackRequestId: { in: feedbackRequestIds } } });
  await prisma.feedbackRequest.deleteMany({ where: { id: { in: feedbackRequestIds } } });
  await prisma.handoverPacket.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.callSummary.deleteMany({ where: { kickoffCallId: { in: kickoffCallIds } } });
  await prisma.kickoffCall.deleteMany({ where: { id: { in: kickoffCallIds } } });
  await prisma.accessRequest.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.intakeResponse.deleteMany({ where: { intakeFormId: { in: intakeFormIds } } });
  await prisma.intakeForm.deleteMany({ where: { id: { in: intakeFormIds } } });
  await prisma.welcomeDoc.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.esignEvent.deleteMany({ where: { proposalId: { in: proposalIds } } });
  await prisma.proposalLineItem.deleteMany({ where: { proposalId: { in: proposalIds } } });
  await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
  // cancelFollowUpTask only flips status to "stopped" — it never deletes the
  // row — so a follow-up task (created the moment sendProposal/sendInvoice
  // runs) always outlives the invoice/proposal it was created for, and
  // blocks the engagement delete below via the FK on engagementId.
  await prisma.followUpTask.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.engagementStageLog.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.engagement.deleteMany({ where: { id: { in: engagementIds } } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
