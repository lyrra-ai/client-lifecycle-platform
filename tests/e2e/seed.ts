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

export async function seedSentInvoiceWithRealOrder(amountMajor = 50) {
  const tenant = await prisma.tenant.create({ data: { businessName: "Playwright E2E Co" } });
  const ctx = new TenantContext(tenant.id);
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Playwright Client", email: "playwright-e2e@example.com" },
  });
  const engagement = await prisma.engagement.create({
    data: { tenantId: tenant.id, clientId: client.id, stage: "proposal_accepted" },
  });

  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [{ description: "E2E test item", qty: 1, unitPrice: amountMajor, currency: "INR" }],
  });
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "sent" } });
  await getPublicProposal(draft.id);
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "accepted" } });

  const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
  await sendInvoice(ctx, invoice!.id);
  const order = await createRazorpayOrderForInvoice(invoice!.id);

  return { tenantId: tenant.id, engagementId: engagement.id, invoiceId: invoice!.id, order };
}

export async function cleanupTenant(tenantId: string) {
  // FK cascade isn't configured, so this is a best-effort narrow cleanup —
  // dev DB, not the isolated Vitest test DB, so leftover rows are harmless
  // but tidying up keeps repeated local runs from accumulating junk.
  const engagements = await prisma.engagement.findMany({ where: { tenantId }, select: { id: true } });
  const engagementIds = engagements.map((e) => e.id);
  const proposals = await prisma.proposal.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const proposalIds = proposals.map((p) => p.id);
  const invoices = await prisma.invoice.findMany({ where: { engagementId: { in: engagementIds } }, select: { id: true } });
  const invoiceIds = invoices.map((i) => i.id);

  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.proposalLineItem.deleteMany({ where: { proposalId: { in: proposalIds } } });
  await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
  await prisma.engagementStageLog.deleteMany({ where: { engagementId: { in: engagementIds } } });
  await prisma.engagement.deleteMany({ where: { id: { in: engagementIds } } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
