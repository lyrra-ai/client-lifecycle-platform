import { describe, it, expect } from "vitest";
import { createTenantWithEngagement } from "../helpers/factories";
import {
  getOrCreateDraftProposal,
  getProposalForOwner,
  updateDraftProposal,
  sendProposal,
  getPublicProposal,
  declineProposal,
} from "@/services/proposal";
import { getEngagement } from "@/services/engagement";
import { prisma } from "@/lib/db";

async function withLineItems(ctx: Awaited<ReturnType<typeof createTenantWithEngagement>>["ctx"], proposalId: string) {
  return updateDraftProposal(ctx, proposalId, {
    coverNote: "Thanks for the opportunity.",
    lineItems: [
      { description: "Design phase", qty: 1, unitPrice: 50000, currency: "INR" },
      { description: "Hosting", qty: 1, unitPrice: 100, currency: "USD" },
    ],
  });
}

describe("getOrCreateDraftProposal", () => {
  it("creates version 1 the first time an engagement's proposal is opened", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();

    const proposal = await getOrCreateDraftProposal(ctx, engagement.id);

    expect(proposal.version).toBe(1);
    expect(proposal.status).toBe("draft");
  });

  it("returns the same draft on a second open without creating a duplicate", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const first = await getOrCreateDraftProposal(ctx, engagement.id);

    const second = await getOrCreateDraftProposal(ctx, engagement.id);

    expect(second.id).toBe(first.id);
    const count = await prisma.proposal.count({ where: { engagementId: engagement.id } });
    expect(count).toBe(1);
  });

  it("creates a new version, cloning line items, once the previous one is no longer a draft (PRD §4: never overwritten silently)", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);
    await declineProposal(draft.publicToken);

    const reopened = await getOrCreateDraftProposal(ctx, engagement.id);

    expect(reopened.version).toBe(2);
    expect(reopened.status).toBe("draft");
    const v2 = await getProposalForOwner(ctx, reopened.id);
    expect(v2.lineItems).toHaveLength(2);

    // version 1 is untouched
    const v1 = await getProposalForOwner(ctx, draft.id);
    expect(v1.status).toBe("declined");
    expect(v1.lineItems).toHaveLength(2);
  });
});

describe("updateDraftProposal", () => {
  it("refuses to edit a proposal that is no longer a draft", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);

    await expect(
      updateDraftProposal(ctx, draft.id, { lineItems: [{ description: "x", qty: 1, unitPrice: 1, currency: "INR" }] }),
    ).rejects.toThrow(/only a draft/i);
  });

  it("stores money in minor units with no float drift", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);

    const updated = await withLineItems(ctx, draft.id);

    expect(updated.lineItems.find((i) => i.currency === "INR")!.unitPriceMinor).toBe("5000000");
    expect(updated.totals).toEqual({ INR: "5000000", USD: "10000" });
  });
});

describe("sendProposal", () => {
  it("refuses to send a proposal with no line items", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);

    await expect(sendProposal(ctx, draft.id)).rejects.toThrow(/at least one line item/i);
  });

  it("advances the engagement from 'lead' to 'proposal_sent' on first send (System Design §3.1)", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);

    await sendProposal(ctx, draft.id);

    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("proposal_sent");
  });

  it("does not re-advance the engagement when sending a later version (already past 'lead')", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("proposal_sent");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);

    await expect(sendProposal(ctx, draft.id)).resolves.not.toThrow();
    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("proposal_sent");
  });

  it("refuses to send a proposal twice", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);

    await expect(sendProposal(ctx, draft.id)).rejects.toThrow(/only a draft/i);
  });
});

describe("getPublicProposal (no-login client view)", () => {
  it("flips status from sent to viewed on first open", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);

    const viewed = await getPublicProposal(draft.publicToken);

    expect(viewed.status).toBe("viewed");
  });

  it("flips an unaccepted, past-validUntil proposal to expired on open", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);
    await prisma.proposal.update({ where: { id: draft.id }, data: { validUntil: new Date("2000-01-01") } });

    const result = await getPublicProposal(draft.publicToken);

    expect(result.status).toBe("expired");
  });
});

describe("declineProposal", () => {
  it("only allows declining a sent/viewed proposal", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);

    await expect(declineProposal(draft.publicToken)).rejects.toThrow(/no longer be declined/i);
  });

  it("marks a sent proposal declined", async () => {
    const { ctx, engagement } = await createTenantWithEngagement();
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await withLineItems(ctx, draft.id);
    await sendProposal(ctx, draft.id);

    const declined = await declineProposal(draft.publicToken);

    expect(declined.status).toBe("declined");
  });
});
