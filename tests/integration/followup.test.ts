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

describe("createFollowUpTask / cancelFollowUpTask", () => {
  it("creates a pending task scheduled for the first cadence day", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const { createFollowUpTask } = await import("@/services/followup");

    const task = await createFollowUpTask(tenant.id, engagement.id, "proposal", "prop_1");

    expect(task.status).toBe("pending");
    const expectedDay = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(Math.abs(task.nextRunAt.getTime() - expectedDay.getTime())).toBeLessThan(5000);
    void ctx;
  });

  it("is idempotent — a second call for the same target is a no-op while one is pending", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const { createFollowUpTask } = await import("@/services/followup");

    const first = await createFollowUpTask(tenant.id, engagement.id, "proposal", "prop_1");
    const second = await createFollowUpTask(tenant.id, engagement.id, "proposal", "prop_1");

    expect(second.id).toBe(first.id);
    const count = await prisma.followUpTask.count({ where: { targetType: "proposal", targetId: "prop_1" } });
    expect(count).toBe(1);
  });

  it("uses a tenant's custom cadence rule when one exists", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    await prisma.followUpRule.create({ data: { tenantId: tenant.id, targetType: "invoice", nudgeDaysAfter: [1, 3], maxNudges: 2 } });
    const { createFollowUpTask } = await import("@/services/followup");

    const task = await createFollowUpTask(tenant.id, engagement.id, "invoice", "inv_1");

    const expectedDay = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    expect(Math.abs(task.nextRunAt.getTime() - expectedDay.getTime())).toBeLessThan(5000);
  });

  it("cancelFollowUpTask stops the pending task for that target", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const { createFollowUpTask, cancelFollowUpTask } = await import("@/services/followup");
    const task = await createFollowUpTask(tenant.id, engagement.id, "proposal", "prop_1");

    await cancelFollowUpTask("proposal", "prop_1");

    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("stopped");
  });
});

describe("end-to-end lifecycle hooks", () => {
  it("sendProposal creates a follow-up task; declining it cancels the task", async () => {
    const { getOrCreateDraftProposal, updateDraftProposal, sendProposal, declineProposal } = await import("@/services/proposal");
    const { tenant, ctx } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await updateDraftProposal(ctx, draft.id, { lineItems: [{ description: "x", qty: 1, unitPrice: 100, currency: "INR" }] });
    await sendProposal(ctx, draft.id);

    const task = await prisma.followUpTask.findFirstOrThrow({ where: { targetType: "proposal", targetId: draft.id } });
    expect(task.status).toBe("pending");

    await declineProposal(draft.publicToken);

    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("stopped");
  });

  it("sendIntakeForm creates a task; submitting a response cancels it", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { questions: [{ label: "Q1", required: false }] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { autoCreateIntakeForm, sendIntakeForm, submitIntakeResponse } = await import("@/services/onboarding");
    const { tenant, ctx } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
    await prisma.proposal.create({ data: { engagementId: engagement.id, status: "accepted" , publicToken: generatePublicToken()} });
    const form = await autoCreateIntakeForm(ctx, engagement.id);
    await sendIntakeForm(ctx, form.id);

    const task = await prisma.followUpTask.findFirstOrThrow({ where: { targetType: "intake_form", targetId: form.id } });
    expect(task.status).toBe("pending");

    await submitIntakeResponse(form.publicToken, {});

    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("stopped");
  });

  it("createAccessRequests creates a task per platform; granting one cancels only that one", async () => {
    const { createAccessRequests, setAccessRequestStatus } = await import("@/services/onboarding");
    const { tenant, ctx } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const [req1, req2] = await createAccessRequests(ctx, engagement.id, ["Google Analytics", "WordPress"]);

    const task1 = await prisma.followUpTask.findFirstOrThrow({ where: { targetType: "access_request", targetId: req1!.id } });
    const task2 = await prisma.followUpTask.findFirstOrThrow({ where: { targetType: "access_request", targetId: req2!.id } });
    expect(task1.status).toBe("pending");
    expect(task2.status).toBe("pending");

    await setAccessRequestStatus(ctx, req1!.id, "granted");

    expect((await prisma.followUpTask.findUniqueOrThrow({ where: { id: task1.id } })).status).toBe("stopped");
    expect((await prisma.followUpTask.findUniqueOrThrow({ where: { id: task2.id } })).status).toBe("pending");
  });
});

describe("processDueFollowUps", () => {
  it("drafts a message for a due, undrafted task and leaves it pending", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "Hey, just checking in on the proposal!",
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const task = await prisma.followUpTask.create({
      data: { engagementId: engagement.id, targetType: "proposal", targetId: "prop_1", nextRunAt: new Date(Date.now() - 1000) },
    });
    const { processDueFollowUps } = await import("@/services/followup");

    const result = await processDueFollowUps();

    expect(result.drafted).toBe(1);
    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.draftMessage).toBe("Hey, just checking in on the proposal!");
    expect(updated.status).toBe("pending");
  });

  it("does not re-draft a task that already has a draft", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    await prisma.followUpTask.create({
      data: {
        engagementId: engagement.id, targetType: "proposal", targetId: "prop_1",
        nextRunAt: new Date(Date.now() - 1000), draftMessage: "Already drafted",
      },
    });
    const { processDueFollowUps } = await import("@/services/followup");

    const result = await processDueFollowUps();

    expect(result.drafted).toBe(0);
    expect(AIGateway.generate).not.toHaveBeenCalled();
  });

  it("skips a snoozed task even if due", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    await prisma.followUpTask.create({
      data: {
        engagementId: engagement.id, targetType: "proposal", targetId: "prop_1",
        nextRunAt: new Date(Date.now() - 1000), snoozedUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    const { processDueFollowUps } = await import("@/services/followup");

    const result = await processDueFollowUps();

    expect(result.drafted).toBe(0);
    expect(AIGateway.generate).not.toHaveBeenCalled();
  });
});

describe("reviewAndSendFollowUp", () => {
  it("advances the task to the next cadence day after sending, keeping it pending", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id, { email: "c@test.com" });
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const task = await prisma.followUpTask.create({
      data: {
        engagementId: engagement.id, targetType: "proposal", targetId: "prop_1",
        nextRunAt: new Date(), draftMessage: "Draft",
      },
    });
    const { reviewAndSendFollowUp } = await import("@/services/followup");

    const result = await reviewAndSendFollowUp(ctx, task.id, "Final message");

    expect(result.stopped).toBe(false);
    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(1);
    expect(updated.draftMessage).toBeNull();
    expect(updated.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("stops the series once maxNudges is reached", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    await prisma.followUpRule.create({ data: { tenantId: tenant.id, targetType: "proposal", nudgeDaysAfter: [2, 5, 9], maxNudges: 1 } });
    const task = await prisma.followUpTask.create({
      data: { engagementId: engagement.id, targetType: "proposal", targetId: "prop_1", nextRunAt: new Date(), draftMessage: "Draft" },
    });
    const { reviewAndSendFollowUp } = await import("@/services/followup");

    const result = await reviewAndSendFollowUp(ctx, task.id, "Final message");

    expect(result.stopped).toBe(true);
    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("stopped");
  });

  it("refuses to send a task that is no longer active", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const task = await prisma.followUpTask.create({
      data: { engagementId: engagement.id, targetType: "proposal", targetId: "prop_1", nextRunAt: new Date(), status: "stopped" },
    });
    const { reviewAndSendFollowUp } = await import("@/services/followup");

    await expect(reviewAndSendFollowUp(ctx, task.id, "msg")).rejects.toThrow(/no longer active/i);
  });
});

describe("snoozeFollowUpTask / markFollowUpResolvedManually", () => {
  it("snoozes with a reason, excluding the task from listFollowUpTasksForOwner's urgency but not from the list", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const task = await prisma.followUpTask.create({
      data: { engagementId: engagement.id, targetType: "proposal", targetId: "prop_1", nextRunAt: new Date() },
    });
    const { snoozeFollowUpTask, listFollowUpTasksForOwner } = await import("@/services/followup");

    await snoozeFollowUpTask(ctx, task.id, "2099-01-01", "Client on vacation");

    const list = await listFollowUpTasksForOwner(ctx);
    expect(list[0]!.snoozedUntil).toBeTruthy();
    expect(list[0]!.snoozeReason).toBe("Client on vacation");
  });

  it("marks a task resolved manually (PRD §12: client responded off-platform)", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const task = await prisma.followUpTask.create({
      data: { engagementId: engagement.id, targetType: "proposal", targetId: "prop_1", nextRunAt: new Date() },
    });
    const { markFollowUpResolvedManually } = await import("@/services/followup");

    await markFollowUpResolvedManually(ctx, task.id);

    const updated = await prisma.followUpTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("stopped");
  });
});

describe("getFollowUpRules / updateFollowUpRule", () => {
  it("returns defaults for every target type when none are configured", async () => {
    const { ctx } = await createTenant();
    const { getFollowUpRules } = await import("@/services/followup");

    const rules = await getFollowUpRules(ctx);

    expect(rules).toHaveLength(5);
    expect(rules.find((r) => r.targetType === "proposal")).toEqual({ targetType: "proposal", nudgeDaysAfter: [2, 5, 9], maxNudges: 3 });
  });

  it("persists a custom rule and reflects it in getFollowUpRules", async () => {
    const { ctx } = await createTenant();
    const { getFollowUpRules, updateFollowUpRule } = await import("@/services/followup");

    await updateFollowUpRule(ctx, "invoice", { nudgeDaysAfter: [1, 2], maxNudges: 5 });

    const rules = await getFollowUpRules(ctx);
    expect(rules.find((r) => r.targetType === "invoice")).toEqual({ targetType: "invoice", nudgeDaysAfter: [1, 2], maxNudges: 5 });
  });
});
