import { describe, it, expect, vi } from "vitest";
import { createTenantWithEngagement } from "../helpers/factories";

// AIGateway itself (provider calls, retry/fallback) is out of scope here —
// this test is about generateAIDraft's own normalization logic: it must
// cope with both a well-formed structured draft and the plain-string
// fallback the static adapter returns on a provider outage (System Design §5).
vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn() },
}));

describe("generateAIDraft", () => {
  it("passes through a well-formed structured draft", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: {
        coverNote: "Here's the plan.",
        lineItems: [{ description: "Design", qty: 1, unitPrice: 500, currency: "USD" }],
      },
      modelUsed: "test-model",
      tokensUsed: 10,
      costEstimate: 0,
    });
    const { generateAIDraft } = await import("@/services/proposal");
    const { ctx, engagement } = await createTenantWithEngagement();

    const draft = await generateAIDraft(ctx, engagement.id, "a short brief");

    expect(draft.coverNote).toBe("Here's the plan.");
    expect(draft.lineItems).toHaveLength(1);
  });

  it("falls back to a cover-note-only draft when the AI Gateway returns the static-fallback string (never blocks, System Design §5)", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "Thank you for the opportunity to work together. Scope and pricing below.",
      modelUsed: "static-fallback",
      tokensUsed: 0,
      costEstimate: 0,
    });
    const { generateAIDraft } = await import("@/services/proposal");
    const { ctx, engagement } = await createTenantWithEngagement();

    const draft = await generateAIDraft(ctx, engagement.id, "a short brief");

    expect(draft.coverNote).toContain("Thank you for the opportunity");
    expect(draft.lineItems).toEqual([]);
  });

  it("falls back the same way when the AI returns malformed JSON shape", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: { unexpected: "shape" },
      modelUsed: "test-model",
      tokensUsed: 10,
      costEstimate: 0,
    });
    const { generateAIDraft } = await import("@/services/proposal");
    const { ctx, engagement } = await createTenantWithEngagement();

    const draft = await generateAIDraft(ctx, engagement.id, "a short brief");

    expect(draft.lineItems).toEqual([]);
  });
});
