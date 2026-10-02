import { describe, it, expect } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { getOrCreateDraftProposal, updateDraftProposal, sendProposal, getPublicProposal } from "@/services/proposal";
import { getEsignContext, requestEsignOtp, verifyEsignOtp } from "@/services/proposal/esign";
import { getEngagement } from "@/services/engagement";
import { prisma } from "@/lib/db";

/** A proposal already at status "viewed" on an engagement at "proposal_sent" — the only state e-sign can act on. */
async function createSignableProposal() {
  const { ctx, tenant } = await createTenant();
  const client = await createClient(tenant.id, { name: "Anita Rao", phone: "+919876543210" });
  const engagement = await createEngagement(tenant.id, client.id, "lead");
  const draft = await getOrCreateDraftProposal(ctx, engagement.id);
  await updateDraftProposal(ctx, draft.id, {
    lineItems: [{ description: "Design", qty: 1, unitPrice: 500, currency: "USD" }],
  });
  await sendProposal(ctx, draft.id);
  await getPublicProposal(draft.publicToken); // flips sent -> viewed

  return { ctx, tenant, client, engagement, proposalId: draft.id, proposalToken: draft.publicToken };
}

async function latestCodeFor(identifier: string): Promise<string> {
  const otp = await prisma.otpCode.findFirst({ where: { identifier }, orderBy: { createdAt: "desc" } });
  return otp!.code;
}

describe("getEsignContext", () => {
  it("is signable once the proposal has been viewed, prefilled from the Client record", async () => {
    const { proposalToken } = await createSignableProposal();

    const context = await getEsignContext(proposalToken);

    expect(context.signable).toBe(true);
    expect(context.clientName).toBe("Anita Rao");
    expect(context.clientPhone).toBe("+919876543210");
  });

  it("is not signable while still a draft", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);

    const context = await getEsignContext(draft.publicToken);

    expect(context.signable).toBe(false);
  });
});

describe("requestEsignOtp", () => {
  it("refuses when the proposal isn't viewed", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);

    const result = await requestEsignOtp(draft.publicToken, "+919876543210");

    expect(result).toEqual({ ok: false, reason: "not_signable" });
  });

  it("enforces the resend cooldown on a second immediate request (PRD §5)", async () => {
    const { proposalToken } = await createSignableProposal();
    await requestEsignOtp(proposalToken, "+919876543210");

    const second = await requestEsignOtp(proposalToken, "+919876543210");

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("cooldown");
  });
});

describe("verifyEsignOtp", () => {
  it("creates an immutable EsignEvent, accepts the proposal, and advances the engagement (System Design §3.1)", async () => {
    const { proposalId, proposalToken, engagement, ctx } = await createSignableProposal();
    await requestEsignOtp(proposalToken, "+919876543210");
    const code = await latestCodeFor("+919876543210");

    const result = await verifyEsignOtp(proposalToken, "Anita Rao", "+919876543210", code, "203.0.113.5");

    expect(result.ok).toBe(true);

    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal.status).toBe("accepted");

    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("proposal_accepted");

    const esignEvent = await prisma.esignEvent.findFirstOrThrow({ where: { proposalId } });
    expect(esignEvent.signerName).toBe("Anita Rao");
    expect(esignEvent.ipAddress).toBe("203.0.113.5");
    expect(esignEvent.otpVerifiedAt).not.toBeNull();
  });

  it("locks out after 3 incorrect attempts (stricter than login's 5, PRD §5)", async () => {
    const { proposalToken } = await createSignableProposal();
    await requestEsignOtp(proposalToken, "+919876543210");
    const code = await latestCodeFor("+919876543210");

    for (let i = 0; i < 3; i++) {
      await verifyEsignOtp(proposalToken, "Anita Rao", "+919876543210", "000000", null);
    }

    const result = await verifyEsignOtp(proposalToken, "Anita Rao", "+919876543210", code, null);

    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("refuses to sign a proposal that is no longer viewable (e.g. already accepted)", async () => {
    const { proposalToken } = await createSignableProposal();
    await requestEsignOtp(proposalToken, "+919876543210");
    const code = await latestCodeFor("+919876543210");
    await verifyEsignOtp(proposalToken, "Anita Rao", "+919876543210", code, null);

    const result = await requestEsignOtp(proposalToken, "+919876543210");

    expect(result).toEqual({ ok: false, reason: "not_signable" });
  });
});
