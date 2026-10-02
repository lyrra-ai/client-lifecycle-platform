import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";
import { generatePublicToken } from "@/lib/public-token";

vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function createEngagementWithAcceptedProposal(coverNote = "A 3-page website redesign.") {
  const { ctx, tenant } = await createTenant();
  const client = await createClient(tenant.id, { name: "Dev Patel" });
  const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
  const proposal = await prisma.proposal.create({
    data: { engagementId: engagement.id, status: "accepted", coverNote, publicToken: generatePublicToken() },
  });
  return { ctx, tenant, client, engagement, proposal };
}

describe("autoCreateWelcomeDoc", () => {
  it("drafts a welcome doc using the AI's structured text response", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "Welcome, Dev! Here's what happens next...",
      modelUsed: "test-model",
      tokensUsed: 10,
      costEstimate: 0,
    });
    const { autoCreateWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const doc = await autoCreateWelcomeDoc(ctx, engagement.id);

    expect(doc.status).toBe("draft");
    expect(doc.content).toBe("Welcome, Dev! Here's what happens next...");
  });

  it("falls back to a generic template if the AI returns an empty draft (never blocks, System Design §5)", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "",
      modelUsed: "static-fallback",
      tokensUsed: 0,
      costEstimate: 0,
    });
    const { autoCreateWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const doc = await autoCreateWelcomeDoc(ctx, engagement.id);

    expect(doc.content).toContain("Dev Patel");
  });

  it("passes the tenant's users as team info and the proposal's cover note as scope", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const generate = AIGateway.generate as ReturnType<typeof vi.fn>;
    generate.mockResolvedValueOnce({ draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0 });
    const { autoCreateWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, tenant, engagement } = await createEngagementWithAcceptedProposal("Redesign the homepage.");
    await prisma.user.create({ data: { tenantId: tenant.id, name: "Asha Rao", email: "asha@test.com", role: "owner" } });

    await autoCreateWelcomeDoc(ctx, engagement.id);

    const callArgs = generate.mock.calls[0]![0];
    expect(callArgs.context.team).toEqual([{ name: "Asha Rao", role: "owner" }]);
    expect(callArgs.context.scopeSummary).toBe("Redesign the homepage.");
  });

  it("is idempotent — calling it twice does not create a second doc", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const first = await autoCreateWelcomeDoc(ctx, engagement.id);
    const second = await autoCreateWelcomeDoc(ctx, engagement.id);

    expect(second.id).toBe(first.id);
    const count = await prisma.welcomeDoc.count({ where: { engagementId: engagement.id } });
    expect(count).toBe(1);
  });
});

describe("updateDraftWelcomeDoc / sendWelcomeDoc", () => {
  it("refuses to edit a doc that is no longer a draft", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateWelcomeDoc, sendWelcomeDoc, updateDraftWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const doc = await autoCreateWelcomeDoc(ctx, engagement.id);
    await sendWelcomeDoc(ctx, doc.id);

    await expect(updateDraftWelcomeDoc(ctx, doc.id, "edited")).rejects.toThrow(/only a draft/i);
  });

  it("advances the engagement from deposit_paid to onboarding on send", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateWelcomeDoc, sendWelcomeDoc } = await import("@/services/onboarding");
    const { getEngagement } = await import("@/services/engagement");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const doc = await autoCreateWelcomeDoc(ctx, engagement.id);

    const result = await sendWelcomeDoc(ctx, doc.id);

    expect(result.publicUrl).toBe(`/w/${doc.publicToken}`);
    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("onboarding");
  });

  it("sets sentAt and refuses a second send", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: "ok", modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateWelcomeDoc, sendWelcomeDoc } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const doc = await autoCreateWelcomeDoc(ctx, engagement.id);
    await sendWelcomeDoc(ctx, doc.id);

    const sentDoc = await prisma.welcomeDoc.findUniqueOrThrow({ where: { id: doc.id } });
    expect(sentDoc.sentAt).not.toBeNull();
    await expect(sendWelcomeDoc(ctx, doc.id)).rejects.toThrow(/only a draft/i);
  });
});
