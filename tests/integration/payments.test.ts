import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { TenantContext } from "@/lib/tenant";
import { getOrCreateDraftProposal, updateDraftProposal, getPublicProposal } from "@/services/proposal";
import { autoCreateDepositInvoices, sendInvoice, createManualInvoice } from "@/services/billing";
import { getEngagement } from "@/services/engagement";
import { prisma } from "@/lib/db";

// Razorpay itself (the hosted checkout, their actual API) is out of scope
// for an integration test — this suite proves everything WE control:
// idempotent payment recording, the stage-advance guard, and order reuse.
vi.mock("@/lib/integrations/razorpay", () => ({
  getRazorpayClient: vi.fn(),
}));

// recordPaymentFromRazorpay transitively triggers autoCreateWelcomeDoc
// (PRD §8) on the first deposit payment — mock AIGateway the same way
// proposal-ai-draft.test.ts does, so this suite doesn't depend on a real
// provider call.
vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn().mockResolvedValue({ draft: "Welcome!", modelUsed: "m", tokensUsed: 1, costEstimate: 0 }) },
}));

async function createSentInvoice() {
  const { ctx, tenant } = await createTenant();
  const client = await createClient(tenant.id);
  const engagement = await createEngagement(tenant.id, client.id, "proposal_accepted");
  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [{ description: "Design", qty: 1, unitPrice: 1000, currency: "INR" }],
  });
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "sent" } });
  await getPublicProposal(draft.publicToken);
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "accepted" } });

  const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
  await sendInvoice(ctx, invoice!.id);

  return { ctx, tenant, client, engagement, invoiceId: invoice!.id, invoicePublicToken: invoice!.publicToken };
}

function fakePaymentEntity(overrides: Partial<{ id: string; order_id: string; amount: number; method: string; created_at: number; status: string }> = {}) {
  return {
    id: overrides.id ?? "pay_test123",
    order_id: overrides.order_id ?? "order_test123",
    amount: overrides.amount ?? 50000,
    method: overrides.method ?? "upi",
    created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    status: overrides.status ?? "captured",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRazorpayOrderForInvoice", () => {
  it("creates an order and stores its id on the invoice", async () => {
    const { getRazorpayClient } = await import("@/lib/integrations/razorpay");
    const create = vi.fn().mockResolvedValue({ id: "order_abc" });
    (getRazorpayClient as ReturnType<typeof vi.fn>).mockReturnValue({ orders: { create } });
    const { createRazorpayOrderForInvoice } = await import("@/services/billing");
    const { invoiceId, invoicePublicToken } = await createSentInvoice();

    const order = await createRazorpayOrderForInvoice(invoicePublicToken);

    expect(order.orderId).toBe("order_abc");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50000, currency: "INR", notes: { invoiceId } }),
    );
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.razorpayOrderId).toBe("order_abc");
  });

  it("reuses the existing order on a second call instead of creating a duplicate", async () => {
    const { getRazorpayClient } = await import("@/lib/integrations/razorpay");
    const create = vi.fn().mockResolvedValue({ id: "order_abc" });
    (getRazorpayClient as ReturnType<typeof vi.fn>).mockReturnValue({ orders: { create } });
    const { createRazorpayOrderForInvoice } = await import("@/services/billing");
    const { invoicePublicToken } = await createSentInvoice();
    await createRazorpayOrderForInvoice(invoicePublicToken);

    const second = await createRazorpayOrderForInvoice(invoicePublicToken);

    expect(second.orderId).toBe("order_abc");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("refuses to create an order for an invoice that isn't sent", async () => {
    const { createRazorpayOrderForInvoice } = await import("@/services/billing");
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "proposal_accepted");
    const invoice = await createManualInvoice(new TenantContext(tenant.id), engagement.id, {
      type: "final",
      amountMajor: 100,
      currency: "INR",
      gstApplicable: false,
    });

    await expect(createRazorpayOrderForInvoice(invoice.publicToken)).rejects.toThrow(/only a sent invoice/i);
  });
});

describe("recordPaymentFromRazorpay", () => {
  it("creates a Payment, marks the invoice paid, and advances the engagement off deposit_invoiced", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { ctx, engagement, invoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_test123" } });

    const result = await recordPaymentFromRazorpay(fakePaymentEntity({ order_id: "order_test123" }));

    expect(result.alreadyRecorded).toBe(false);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("paid");
    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("deposit_paid");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayPaymentId: "pay_test123" } });
    expect(payment.method).toBe("upi");
  });

  it("auto-drafts the welcome doc on the first deposit payment (PRD §8)", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { invoiceId, engagement } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_welcome" } });

    await recordPaymentFromRazorpay(fakePaymentEntity({ id: "pay_welcome", order_id: "order_welcome" }));

    const doc = await prisma.welcomeDoc.findFirst({ where: { engagementId: engagement.id } });
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("draft");
  });

  it("auto-drafts the intake form on the first deposit payment (PRD §9)", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { invoiceId, engagement } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_intake" } });

    await recordPaymentFromRazorpay(fakePaymentEntity({ id: "pay_intake", order_id: "order_intake" }));

    const form = await prisma.intakeForm.findFirst({ where: { engagementId: engagement.id } });
    expect(form).not.toBeNull();
    expect(form!.status).toBe("draft");
  });

  it("is a no-op on a redelivered event (idempotent by razorpayPaymentId)", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { invoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_test123" } });
    await recordPaymentFromRazorpay(fakePaymentEntity({ order_id: "order_test123" }));

    const second = await recordPaymentFromRazorpay(fakePaymentEntity({ order_id: "order_test123" }));

    expect(second.alreadyRecorded).toBe(true);
    const count = await prisma.payment.count({ where: { invoiceId } });
    expect(count).toBe(1);
  });

  it("maps an unrecognized Razorpay method to 'other'", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { invoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_test123" } });

    await recordPaymentFromRazorpay(fakePaymentEntity({ order_id: "order_test123", method: "wallet" }));

    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayPaymentId: "pay_test123" } });
    expect(payment.method).toBe("other");
  });

  it("does not re-advance the engagement when a later (milestone) invoice is paid", async () => {
    const { recordPaymentFromRazorpay } = await import("@/services/billing");
    const { ctx, engagement, invoiceId: depositInvoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: depositInvoiceId }, data: { razorpayOrderId: "order_deposit" } });
    await recordPaymentFromRazorpay(fakePaymentEntity({ id: "pay_deposit", order_id: "order_deposit" }));

    const milestone = await createManualInvoice(ctx, engagement.id, {
      type: "milestone",
      amountMajor: 200,
      currency: "INR",
      gstApplicable: false,
    });
    await sendInvoice(ctx, milestone.id);
    await prisma.invoice.update({ where: { id: milestone.id }, data: { razorpayOrderId: "order_milestone" } });

    await recordPaymentFromRazorpay(fakePaymentEntity({ id: "pay_milestone", order_id: "order_milestone", amount: 20000 }));

    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("deposit_paid"); // unchanged by the second payment
  });
});

describe("reconcilePendingInvoices", () => {
  it("records a captured payment the webhook never reported", async () => {
    const { getRazorpayClient } = await import("@/lib/integrations/razorpay");
    const fetchPayments = vi.fn().mockResolvedValue({
      items: [fakePaymentEntity({ order_id: "order_test123" })],
    });
    (getRazorpayClient as ReturnType<typeof vi.fn>).mockReturnValue({ orders: { fetchPayments } });
    const { reconcilePendingInvoices } = await import("@/services/billing");
    const { invoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_test123" } });

    const result = await reconcilePendingInvoices();

    expect(result.checked).toBe(1);
    expect(result.recorded).toBe(1);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("paid");
  });

  it("skips a non-captured (e.g. failed) payment, leaving the invoice unpaid", async () => {
    const { getRazorpayClient } = await import("@/lib/integrations/razorpay");
    const fetchPayments = vi.fn().mockResolvedValue({
      items: [fakePaymentEntity({ id: "pay_failed", order_id: "order_test123", status: "failed" })],
    });
    (getRazorpayClient as ReturnType<typeof vi.fn>).mockReturnValue({ orders: { fetchPayments } });
    const { reconcilePendingInvoices } = await import("@/services/billing");
    const { invoiceId } = await createSentInvoice();
    await prisma.invoice.update({ where: { id: invoiceId }, data: { razorpayOrderId: "order_test123" } });

    const result = await reconcilePendingInvoices();

    expect(result.recorded).toBe(0);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("sent");
  });
});
