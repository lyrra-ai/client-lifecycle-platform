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
  const client = await createClient(tenant.id, { name: "Dev Patel", email: "dev@test.com" });
  const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
  await prisma.proposal.create({ data: { engagementId: engagement.id, status: "accepted", coverNote , publicToken: generatePublicToken()} });
  return { ctx, tenant, client, engagement };
}

describe("autoCreateIntakeForm", () => {
  it("drafts questions from the AI's structured response, assigning local ids", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: { questions: [{ label: "What's your brand color?", required: true }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const form = await autoCreateIntakeForm(ctx, engagement.id);

    expect(form.status).toBe("draft");
    expect(form.questions).toHaveLength(1);
    expect(form.questions[0]!.label).toBe("What's your brand color?");
    expect(form.questions[0]!.id).toBeTruthy();
  });

  it("falls back to default questions when the AI returns a malformed/non-JSON draft", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "Draft a scope-specific intake questionnaire.", // static-fallback's plain-string shape
      modelUsed: "static-fallback", tokensUsed: 0, costEstimate: 0,
    });
    const { autoCreateIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const form = await autoCreateIntakeForm(ctx, engagement.id);

    expect(form.questions.length).toBeGreaterThan(0);
    expect(form.questions.some((q) => q.required)).toBe(true);
  });

  it("is idempotent — calling it twice does not create a second form", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { questions: [{ label: "Q1", required: false }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();

    const first = await autoCreateIntakeForm(ctx, engagement.id);
    const second = await autoCreateIntakeForm(ctx, engagement.id);

    expect(second.id).toBe(first.id);
    const count = await prisma.intakeForm.count({ where: { engagementId: engagement.id } });
    expect(count).toBe(1);
  });
});

describe("updateIntakeForm", () => {
  it("allows editing even after the form has been sent (PRD §9: never locked)", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { questions: [{ label: "Q1", required: false }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm, sendIntakeForm, updateIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const form = await autoCreateIntakeForm(ctx, engagement.id);
    await sendIntakeForm(ctx, form.id);

    const newQuestions = [{ id: "x", label: "Updated question", required: true }];
    const updated = await updateIntakeForm(ctx, form.id, newQuestions);

    expect(updated.questions).toEqual(newQuestions);
    expect(updated.status).toBe("sent"); // sending status untouched by editing
  });
});

describe("regenerateIntakeForm", () => {
  it("overwrites the question set with a fresh AI draft", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const generate = AIGateway.generate as ReturnType<typeof vi.fn>;
    generate.mockResolvedValueOnce({
      draft: { questions: [{ label: "Original", required: false }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm, regenerateIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const form = await autoCreateIntakeForm(ctx, engagement.id);

    generate.mockResolvedValueOnce({
      draft: { questions: [{ label: "Regenerated", required: true }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const updated = await regenerateIntakeForm(ctx, form.id);

    expect(updated.questions).toHaveLength(1);
    expect(updated.questions[0]!.label).toBe("Regenerated");
  });
});

describe("submitIntakeResponse / getPublicIntakeForm", () => {
  async function createSentForm() {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { questions: [
        { label: "Required Q", required: true },
        { label: "Optional Q", required: false },
      ] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm, sendIntakeForm } = await import("@/services/onboarding");
    const { ctx, engagement } = await createEngagementWithAcceptedProposal();
    const form = await autoCreateIntakeForm(ctx, engagement.id);
    await sendIntakeForm(ctx, form.id);
    return { ctx, form };
  }

  it("rejects a submission missing a required answer", async () => {
    const { submitIntakeResponse } = await import("@/services/onboarding");
    const { form } = await createSentForm();
    const requiredId = form.questions.find((q) => q.required)!.id;
    void requiredId;

    await expect(submitIntakeResponse(form.publicToken, {})).rejects.toThrow(/please answer/i);
  });

  it("accepts a complete submission and marks the public view as already-submitted", async () => {
    const { submitIntakeResponse, getPublicIntakeForm } = await import("@/services/onboarding");
    const { form } = await createSentForm();
    const requiredId = form.questions.find((q) => q.required)!.id;

    await submitIntakeResponse(form.publicToken, { [requiredId]: "An answer" });

    const publicView = await getPublicIntakeForm(form.publicToken);
    expect(publicView.alreadySubmitted).toBe(true);
  });

  it("rejects a second submission to the same form", async () => {
    const { submitIntakeResponse } = await import("@/services/onboarding");
    const { form } = await createSentForm();
    const requiredId = form.questions.find((q) => q.required)!.id;
    await submitIntakeResponse(form.publicToken, { [requiredId]: "First answer" });

    await expect(submitIntakeResponse(form.publicToken, { [requiredId]: "Second answer" })).rejects.toThrow(/already been submitted/i);
  });

  it("surfaces the submitted answers to the owner", async () => {
    const { submitIntakeResponse, getIntakeFormForOwner } = await import("@/services/onboarding");
    const { ctx, form } = await createSentForm();
    const requiredId = form.questions.find((q) => q.required)!.id;
    await submitIntakeResponse(form.publicToken, { [requiredId]: "Blue and white" });

    const owned = await getIntakeFormForOwner(ctx, form.id);

    expect(owned.response).not.toBeNull();
    expect(owned.response!.answers[requiredId]).toBe("Blue and white");
  });
});
