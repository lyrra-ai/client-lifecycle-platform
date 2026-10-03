import { describe, it, expect } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { getOrCreateDraftProposal, updateDraftProposal, sendProposal, getPublicProposal } from "@/services/proposal";
import {
  autoCreateDepositInvoices,
  listInvoicesForOwner,
  updateDraftInvoice,
  sendInvoice,
  voidInvoice,
  createManualInvoice,
  getPublicInvoice,
} from "@/services/billing";
import { getEngagement } from "@/services/engagement";
import { prisma } from "@/lib/db";

/** An engagement with an accepted multi-currency proposal — the state autoCreateDepositInvoices expects. */
async function createAcceptedEngagement(tenantOverrides = {}, clientOverrides = {}) {
  const { ctx, tenant } = await createTenant("Test Tenant", tenantOverrides);
  const client = await createClient(tenant.id, clientOverrides);
  const engagement = await createEngagement(tenant.id, client.id, "proposal_accepted");
  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [
      { description: "Design", qty: 1, unitPrice: 50000, currency: "INR" },
      { description: "Hosting", qty: 1, unitPrice: 100, currency: "USD" },
    ],
  });
  // Push it through sent -> viewed -> accepted directly (esign itself is tested elsewhere).
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "sent" } });
  await getPublicProposal(draft.publicToken);
  await prisma.proposal.update({ where: { id: draft.id }, data: { status: "accepted" } });

  return { ctx, tenant, client, engagement, proposalId: draft.id };
}

describe("autoCreateDepositInvoices", () => {
  it("creates one deposit invoice per currency in the accepted proposal (PRD §6)", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();

    const invoices = await autoCreateDepositInvoices(ctx, engagement.id);

    expect(invoices).toHaveLength(2);
    const inr = invoices.find((i) => i.currency === "INR")!;
    const usd = invoices.find((i) => i.currency === "USD")!;
    expect(inr.amountMinor).toBe("2500000"); // 50% of 5,000,000 paise
    expect(usd.amountMinor).toBe("5000"); // 50% of 10,000 cents
    expect(inr.type).toBe("deposit");
    expect(inr.status).toBe("draft");
  });

  it("uses the tenant's defaultDepositPercent", async () => {
    const { ctx, engagement } = await createAcceptedEngagement({ defaultDepositPercent: 30 });

    const invoices = await autoCreateDepositInvoices(ctx, engagement.id);

    const inr = invoices.find((i) => i.currency === "INR")!;
    expect(inr.amountMinor).toBe("1500000"); // 30% of 5,000,000
  });

  it("is idempotent — calling it twice does not duplicate invoices", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    await autoCreateDepositInvoices(ctx, engagement.id);

    const second = await autoCreateDepositInvoices(ctx, engagement.id);

    expect(second).toHaveLength(2);
    const count = await prisma.invoice.count({ where: { engagementId: engagement.id } });
    expect(count).toBe(2);
  });

  it("computes GST breakup only when tenant has a GST number and both states are known", async () => {
    const { ctx, engagement } = await createAcceptedEngagement(
      { gstNumber: "29ABCDE1234F1Z5", state: "Karnataka" },
      { state: "Karnataka" },
    );

    const invoices = await autoCreateDepositInvoices(ctx, engagement.id);

    const inr = invoices.find((i) => i.currency === "INR")!;
    expect(inr.gstApplicable).toBe(true);
    expect(inr.gstBreakup).toEqual({ cgst: "225000", sgst: "225000", hsnSac: "9983" });
  });

  it("leaves GST off when the client's state is unknown, even if the tenant is GST-registered", async () => {
    const { ctx, engagement } = await createAcceptedEngagement({ gstNumber: "29ABCDE1234F1Z5", state: "Karnataka" }, {});

    const invoices = await autoCreateDepositInvoices(ctx, engagement.id);

    expect(invoices[0]!.gstApplicable).toBe(false);
    expect(invoices[0]!.gstBreakup).toBeNull();
  });

  it("throws when there is no accepted proposal for the engagement", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");

    await expect(autoCreateDepositInvoices(ctx, engagement.id)).rejects.toThrow(/no accepted proposal/i);
  });
});

describe("updateDraftInvoice", () => {
  it("refuses to edit a sent invoice (PRD §6: correction requires void + reissue)", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
    await sendInvoice(ctx, invoice!.id);

    await expect(updateDraftInvoice(ctx, invoice!.id, { amountMajor: 999 })).rejects.toThrow(/only a draft/i);
  });

  it("recomputes GST breakup when toggled on, using the engagement's client state", async () => {
    // No gstNumber on the tenant, so auto-create leaves GST off — but the
    // owner can still toggle it on per-invoice (PRD §6: a tenant's
    // registration status is fixed, but what a client needs can vary).
    const { ctx, engagement } = await createAcceptedEngagement({ state: "Karnataka" }, { state: "Maharashtra" });
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
    expect(invoice!.gstApplicable).toBe(false);

    const updated = await updateDraftInvoice(ctx, invoice!.id, { gstApplicable: true });

    expect(updated.gstApplicable).toBe(true);
    expect(updated.gstBreakup).toEqual({ igst: "450000", hsnSac: "9983" });
  });
});

describe("sendInvoice", () => {
  it("advances the engagement from proposal_accepted to deposit_invoiced on first send", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);

    await sendInvoice(ctx, invoice!.id);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("deposit_invoiced");
  });

  it("whatsapped stays false when the client has no phone on file (default email_first channel)", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);

    const result = await sendInvoice(ctx, invoice!.id);

    expect(result.whatsapped).toBe(false);
  });

  it("refuses to send a zero-amount invoice", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const invoice = await createManualInvoice(ctx, engagement.id, {
      type: "final",
      amountMajor: 0.001, // rounds to 0 minor units
      currency: "INR",
      gstApplicable: false,
    });

    await expect(sendInvoice(ctx, invoice.id)).rejects.toThrow(/greater than zero/i);
  });

  it("refuses to send an already-sent invoice", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
    await sendInvoice(ctx, invoice!.id);

    await expect(sendInvoice(ctx, invoice!.id)).rejects.toThrow(/only a draft/i);
  });
});

describe("voidInvoice", () => {
  it("only allows voiding a sent invoice", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);

    await expect(voidInvoice(ctx, invoice!.id)).rejects.toThrow(/only a sent invoice/i);
  });

  it("marks a sent invoice void, preserving it rather than deleting (audit trail)", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
    await sendInvoice(ctx, invoice!.id);

    const voided = await voidInvoice(ctx, invoice!.id);

    expect(voided.status).toBe("void");
    const stillThere = await listInvoicesForOwner(ctx, engagement.id);
    expect(stillThere.find((i) => i.id === invoice!.id)).toBeDefined();
  });
});

describe("createManualInvoice", () => {
  it("creates an additional milestone invoice against the same engagement (PRD §6 multi-milestone split)", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    await autoCreateDepositInvoices(ctx, engagement.id);

    const milestone = await createManualInvoice(ctx, engagement.id, {
      type: "milestone",
      amountMajor: 15000,
      currency: "INR",
      gstApplicable: false,
    });

    expect(milestone.type).toBe("milestone");
    const all = await listInvoicesForOwner(ctx, engagement.id);
    expect(all).toHaveLength(3);
  });
});

describe("getPublicInvoice", () => {
  it("exposes business/client names and amount for the no-login view", async () => {
    const { ctx, engagement } = await createAcceptedEngagement();
    const [invoice] = await autoCreateDepositInvoices(ctx, engagement.id);
    await sendInvoice(ctx, invoice!.id);

    const publicView = await getPublicInvoice(invoice!.publicToken);

    expect(publicView.status).toBe("sent");
    expect(publicView.amount).toBeGreaterThan(0);
    expect(publicView.businessName).toBeTruthy();
    expect(publicView.clientName).toBeTruthy();
  });
});
