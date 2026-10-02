import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";

vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn().mockResolvedValue({ draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0 }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listEngagementsForDashboard", () => {
  it("includes the client name and only the calling tenant's engagements", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id, { name: "Dashboard Client" });
    await createEngagement(tenant.id, client.id, "onboarding");
    const { tenant: otherTenant } = await createTenant();
    const otherClient = await createClient(otherTenant.id);
    await createEngagement(otherTenant.id, otherClient.id, "lead");
    const { listEngagementsForDashboard } = await import("@/services/engagement");

    const rows = await listEngagementsForDashboard(ctx);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientName: "Dashboard Client", stage: "onboarding" });
  });
});

describe("getOutstandingInvoicesTotal", () => {
  it("sums only sent (unpaid) invoices, grouped by currency", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_invoiced");
    await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 50000n, currency: "INR", status: "sent" } });
    await prisma.invoice.create({ data: { engagementId: engagement.id, type: "final", amountMinor: 20000n, currency: "INR", status: "sent" } });
    await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 10000n, currency: "USD", status: "sent" } });
    await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 99999n, currency: "INR", status: "paid" } });
    await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 88888n, currency: "INR", status: "draft" } });
    const { getOutstandingInvoicesTotal } = await import("@/services/billing");

    const totals = await getOutstandingInvoicesTotal(ctx);

    expect(totals).toEqual({ INR: "70000", USD: "10000" });
  });

  it("returns an empty object when nothing is outstanding", async () => {
    const { ctx } = await createTenant();
    const { getOutstandingInvoicesTotal } = await import("@/services/billing");

    expect(await getOutstandingInvoicesTotal(ctx)).toEqual({});
  });
});

describe("getRecentActivity", () => {
  it("merges payments, signed proposals, and intake submissions in time order", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id, { name: "Activity Client" });
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");

    const proposal = await prisma.proposal.create({ data: { engagementId: engagement.id, status: "accepted" } });
    await prisma.esignEvent.create({
      data: { proposalId: proposal.id, signerName: "x", signerPhone: "y", otpVerifiedAt: new Date("2026-01-01") },
    });

    const invoice = await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 50000n, currency: "INR", status: "paid" } });
    await prisma.payment.create({
      data: { invoiceId: invoice.id, razorpayPaymentId: "pay_1", amountMinor: 50000n, method: "upi", paidAt: new Date("2026-01-03") },
    });

    const form = await prisma.intakeForm.create({ data: { engagementId: engagement.id, questions: [], status: "sent" } });
    await prisma.intakeResponse.create({ data: { intakeFormId: form.id, answers: {}, submittedAt: new Date("2026-01-02") } });

    const { getRecentActivity } = await import("@/services/engagement");

    const activity = await getRecentActivity(ctx);

    expect(activity).toHaveLength(3);
    expect(activity.map((a) => a.type)).toEqual(["payment", "intake_submitted", "proposal_signed"]); // newest first
    expect(activity[0]!.label).toContain("Activity Client");
  });

  it("only includes activity from the calling tenant", async () => {
    const { ctx } = await createTenant();
    const { tenant: otherTenant } = await createTenant();
    const otherClient = await createClient(otherTenant.id);
    const otherEngagement = await createEngagement(otherTenant.id, otherClient.id, "onboarding");
    const invoice = await prisma.invoice.create({ data: { engagementId: otherEngagement.id, type: "deposit", amountMinor: 1000n, currency: "INR", status: "paid" } });
    await prisma.payment.create({ data: { invoiceId: invoice.id, razorpayPaymentId: "pay_other", amountMinor: 1000n, method: "upi", paidAt: new Date() } });

    const { getRecentActivity } = await import("@/services/engagement");

    expect(await getRecentActivity(ctx)).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    for (let i = 0; i < 5; i++) {
      const invoice = await prisma.invoice.create({ data: { engagementId: engagement.id, type: "deposit", amountMinor: 1000n, currency: "INR", status: "paid" } });
      await prisma.payment.create({ data: { invoiceId: invoice.id, razorpayPaymentId: `pay_${i}`, amountMinor: 1000n, method: "upi", paidAt: new Date() } });
    }
    const { getRecentActivity } = await import("@/services/engagement");

    const activity = await getRecentActivity(ctx, 3);

    expect(activity).toHaveLength(3);
  });
});
