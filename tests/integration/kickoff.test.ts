import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";

vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const SLOT_A = "2026-11-01T10:00:00.000Z";
const SLOT_B = "2026-11-02T10:00:00.000Z";

describe("scheduleKickoffCall", () => {
  it("drafts an agenda from the AI and stores the proposed slots", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: { sections: [{ title: "Intro", durationMinutes: 5, talkingPoints: ["Say hi"] }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall } = await import("@/services/kickoff");

    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A, SLOT_B]);

    expect(call.proposedSlots).toEqual([SLOT_A, SLOT_B]);
    expect(call.agenda).toEqual([{ title: "Intro", durationMinutes: 5, talkingPoints: ["Say hi"] }]);
    expect(call.scheduledAt).toBeNull();
  });

  it("falls back to a default agenda when the AI draft is malformed", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "not structured json",
      modelUsed: "static-fallback", tokensUsed: 0, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall } = await import("@/services/kickoff");

    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A]);

    expect(call.agenda!.length).toBeGreaterThan(0);
  });

  it("is idempotent — one kickoff call per engagement", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { sections: [] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall } = await import("@/services/kickoff");

    const first = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A]);
    const second = await scheduleKickoffCall(ctx, engagement.id, [SLOT_B]);

    expect(second.id).toBe(first.id);
    expect(second.proposedSlots).toEqual([SLOT_A]); // unchanged by the second call
  });
});

describe("pickKickoffSlot", () => {
  async function createScheduledCall() {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { sections: [] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall } = await import("@/services/kickoff");
    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A, SLOT_B]);
    return { ctx, engagement, call };
  }

  it("confirms a proposed slot and advances the engagement from onboarding to kickoff_scheduled", async () => {
    const { pickKickoffSlot } = await import("@/services/kickoff");
    const { getEngagement } = await import("@/services/engagement");
    const { ctx, engagement, call } = await createScheduledCall();

    await pickKickoffSlot(call.id, SLOT_A);

    const updatedCall = await prisma.kickoffCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(updatedCall.scheduledAt?.toISOString()).toBe(SLOT_A);
    const updatedEngagement = await getEngagement(ctx, engagement.id);
    expect(updatedEngagement.stage).toBe("kickoff_scheduled");
  });

  it("refuses a slot that wasn't proposed", async () => {
    const { pickKickoffSlot } = await import("@/services/kickoff");
    const { call } = await createScheduledCall();

    await expect(pickKickoffSlot(call.id, "2099-01-01T00:00:00.000Z")).rejects.toThrow(/isn't one of the proposed/i);
  });
});

describe("markNoShow / rescheduleKickoffCall / markKickoffDone", () => {
  it("marks no-show without blocking a subsequent reschedule", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { sections: [] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall, markNoShow, rescheduleKickoffCall } = await import("@/services/kickoff");
    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A]);

    const noShow = await markNoShow(ctx, call.id);
    expect(noShow.status).toBe("no_show");

    const rescheduled = await rescheduleKickoffCall(ctx, call.id, [SLOT_B]);
    expect(rescheduled.status).toBe("rescheduled");
    expect(rescheduled.proposedSlots).toEqual([SLOT_B]);
    expect(rescheduled.scheduledAt).toBeNull();
  });

  it("advances the engagement from kickoff_scheduled to kickoff_done only via markKickoffDone", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { sections: [] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall, pickKickoffSlot, markKickoffDone } = await import("@/services/kickoff");
    const { getEngagement } = await import("@/services/engagement");
    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A]);
    await pickKickoffSlot(call.id, SLOT_A);

    await markKickoffDone(ctx, call.id);

    const updated = await getEngagement(ctx, engagement.id);
    expect(updated.stage).toBe("kickoff_done");
  });
});

describe("generateCallSummary", () => {
  async function createDoneCall() {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: { sections: [] }, modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { scheduleKickoffCall, pickKickoffSlot, markKickoffDone } = await import("@/services/kickoff");
    const call = await scheduleKickoffCall(ctx, engagement.id, [SLOT_A]);
    await pickKickoffSlot(call.id, SLOT_A);
    await markKickoffDone(ctx, call.id);
    return { ctx, call };
  }

  it("generates a summary with ownership-tagged action items from notes", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const { ctx, call } = await createDoneCall();
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: {
        summaryText: "Kicked off the website redesign.",
        actionItems: [
          { description: "Send brand assets", owner: "client" },
          { description: "Share first wireframes", owner: "agency" },
        ],
      },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { generateCallSummary } = await import("@/services/kickoff");

    const summary = await generateCallSummary(ctx, call.id, { notes: "Discussed scope and timeline." });

    expect(summary.summaryText).toBe("Kicked off the website redesign.");
    expect(summary.actionItems).toEqual([
      { description: "Send brand assets", owner: "client", done: false },
      { description: "Share first wireframes", owner: "agency", done: false },
    ]);
  });

  it("toggling an action item persists the change", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    const { ctx, call } = await createDoneCall();
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: { summaryText: "Summary.", actionItems: [{ description: "Do a thing", owner: "agency" }] },
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { generateCallSummary, toggleActionItem } = await import("@/services/kickoff");
    await generateCallSummary(ctx, call.id, { notes: "notes" });

    const items = await toggleActionItem(ctx, call.id, 0, true);

    expect(items[0]!.done).toBe(true);
  });
});
