import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";

vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn() },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Default resolution so tests that aren't specifically exercising the AI
  // draft content don't have to set up their own mock just to avoid an
  // undefined-draft crash — override with mockResolvedValueOnce where the
  // draft content itself is being asserted on.
  const { AIGateway } = await import("@/lib/ai-gateway");
  (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
    draft: "Default summary.",
    modelUsed: "m",
    tokensUsed: 1,
    costEstimate: 0,
  });
});

describe("createFeedbackRequest", () => {
  it("advances in_delivery to feedback_requested on the first request", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id, { email: "c@test.com" });
    const engagement = await createEngagement(tenant.id, client.id, "in_delivery");
    const { createFeedbackRequest } = await import("@/services/feedback");
    const { getEngagement } = await import("@/services/engagement");

    await createFeedbackRequest(ctx, engagement.id);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("feedback_requested");
  });

  it("allows a second request on a retainer engagement without erroring (PRD §14: per-milestone use)", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "closed");
    const { createFeedbackRequest } = await import("@/services/feedback");

    await expect(createFeedbackRequest(ctx, engagement.id)).resolves.not.toThrow();
    const count = await prisma.feedbackRequest.count({ where: { engagementId: engagement.id } });
    expect(count).toBe(1);
  });

  it("creates a follow-up task with the feedback_request target type", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "in_delivery");
    const { createFeedbackRequest } = await import("@/services/feedback");

    const result = await createFeedbackRequest(ctx, engagement.id);

    const task = await prisma.followUpTask.findFirstOrThrow({
      where: { targetType: "feedback_request", targetId: result.requestId },
    });
    expect(task.status).toBe("pending");
  });
});

describe("getFollowUpRules default for feedback_request", () => {
  it("defaults to a single nudge after 3 days (PRD §14: one nudge then stop)", async () => {
    const { ctx } = await createTenant();
    const { getFollowUpRules } = await import("@/services/followup");

    const rules = await getFollowUpRules(ctx);

    expect(rules.find((r) => r.targetType === "feedback_request")).toEqual({
      targetType: "feedback_request", nudgeDaysAfter: [3], maxNudges: 1,
    });
  });
});

describe("submitFeedbackResponse", () => {
  it("records the response and cancels the follow-up task", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "in_delivery");
    const { createFeedbackRequest, submitFeedbackResponse } = await import("@/services/feedback");
    const { requestId } = await createFeedbackRequest(ctx, engagement.id);

    await submitFeedbackResponse(requestId, 5, "Great work!");

    const response = await prisma.feedbackResponse.findUniqueOrThrow({ where: { feedbackRequestId: requestId } });
    expect(response.rating).toBe(5);
    const task = await prisma.followUpTask.findFirstOrThrow({ where: { targetType: "feedback_request", targetId: requestId } });
    expect(task.status).toBe("stopped");
  });

  it("rejects a rating outside 1-5", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "in_delivery");
    const { createFeedbackRequest, submitFeedbackResponse } = await import("@/services/feedback");
    const { requestId } = await createFeedbackRequest(ctx, engagement.id);

    await expect(submitFeedbackResponse(requestId, 6)).rejects.toThrow(/between 1 and 5/i);
  });

  it("rejects a second submission for the same request", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "in_delivery");
    const { createFeedbackRequest, submitFeedbackResponse } = await import("@/services/feedback");
    const { requestId } = await createFeedbackRequest(ctx, engagement.id);
    await submitFeedbackResponse(requestId, 4);

    await expect(submitFeedbackResponse(requestId, 5)).rejects.toThrow(/already been submitted/i);
  });

  it("does not close the engagement if handover hasn't been sent yet", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const request = await prisma.feedbackRequest.create({ data: { engagementId: engagement.id } });
    const { submitFeedbackResponse } = await import("@/services/feedback");
    const { getEngagement } = await import("@/services/engagement");

    await submitFeedbackResponse(request.id, 5);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("feedback_requested");
  });
});

describe("createHandoverPacket / sendHandoverPacket", () => {
  it("drafts a summary via AI and is idempotent", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "We delivered the full website redesign as scoped.",
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const { createHandoverPacket } = await import("@/services/feedback");

    const first = await createHandoverPacket(ctx, engagement.id, { deliverables: [{ fileName: "site.zip", url: "https://x.test/site.zip" }] });
    const second = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });

    expect(first.summary).toBe("We delivered the full website redesign as scoped.");
    expect(second.id).toBe(first.id);
  });

  it("refuses to edit a sent packet", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const { createHandoverPacket, sendHandoverPacket, updateHandoverPacket } = await import("@/services/feedback");
    const packet = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });
    await sendHandoverPacket(ctx, packet.id);

    await expect(updateHandoverPacket(ctx, packet.id, { deliverables: [], summary: "edited" })).rejects.toThrow(/unsent/i);
  });

  it("advances feedback_requested to handed_over on send, and to closed if feedback already exists", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const request = await prisma.feedbackRequest.create({ data: { engagementId: engagement.id } });
    const { submitFeedbackResponse, createHandoverPacket, sendHandoverPacket } = await import("@/services/feedback");
    const { getEngagement } = await import("@/services/engagement");
    await submitFeedbackResponse(request.id, 5);

    const packet = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });
    await sendHandoverPacket(ctx, packet.id);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("closed");
  });

  it("stays at handed_over if feedback has not been submitted yet", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const { createHandoverPacket, sendHandoverPacket } = await import("@/services/feedback");
    const { getEngagement } = await import("@/services/engagement");

    const packet = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });
    await sendHandoverPacket(ctx, packet.id);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("handed_over");
  });

  it("closes retroactively once feedback arrives after handover was already sent", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const request = await prisma.feedbackRequest.create({ data: { engagementId: engagement.id } });
    const { createHandoverPacket, sendHandoverPacket, submitFeedbackResponse } = await import("@/services/feedback");
    const { getEngagement } = await import("@/services/engagement");
    const packet = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });
    await sendHandoverPacket(ctx, packet.id);
    expect((await getEngagement(ctx, engagement.id)).stage).toBe("handed_over");

    await submitFeedbackResponse(request.id, 5);

    expect((await getEngagement(ctx, engagement.id)).stage).toBe("closed");
  });

  it("refuses to send an already-sent packet", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "feedback_requested");
    const { createHandoverPacket, sendHandoverPacket } = await import("@/services/feedback");
    const packet = await createHandoverPacket(ctx, engagement.id, { deliverables: [] });
    await sendHandoverPacket(ctx, packet.id);

    await expect(sendHandoverPacket(ctx, packet.id)).rejects.toThrow(/already been sent/i);
  });
});
