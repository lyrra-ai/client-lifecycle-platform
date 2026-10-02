import { describe, it, expect } from "vitest";
import { createTenant, createTenantWithEngagement } from "../helpers/factories";
import { advanceStageAutomatically, setStageManually, getEngagement } from "@/services/engagement";
import { prisma } from "@/lib/db";

describe("advanceStageAutomatically", () => {
  it("moves to the next stage when called with the engagement's actual current stage", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("lead");

    const updated = await advanceStageAutomatically(ctx, engagement.id, "lead");

    expect(updated.stage).toBe("proposal_sent");
  });

  it("refuses to advance if the engagement is not actually at the expected stage (no false 'paid', System Design §3.1)", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("proposal_sent");

    await expect(advanceStageAutomatically(ctx, engagement.id, "lead")).rejects.toThrow();

    const unchanged = await getEngagement(ctx, engagement.id);
    expect(unchanged.stage).toBe("proposal_sent");
  });

  it("logs the automatic transition", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("lead");

    await advanceStageAutomatically(ctx, engagement.id, "lead");

    const logs = await prisma.engagementStageLog.findMany({
      where: { engagementId: engagement.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.automatic).toBe(true);
    expect(logs[0]!.fromStage).toBe("lead");
    expect(logs[0]!.toStage).toBe("proposal_sent");
  });
});

describe("setStageManually", () => {
  it("requires a non-empty reason (System Design §3.1: owner's judgment call, but always logged)", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("lead");

    await expect(setStageManually(ctx, engagement.id, "in_delivery", "")).rejects.toThrow();
  });

  it("allows an out-of-order jump when a reason is given", async () => {
    const { ctx, engagement } = await createTenantWithEngagement("lead");

    const updated = await setStageManually(ctx, engagement.id, "in_delivery", "Client paid via bank transfer, skipping online flow");

    expect(updated.stage).toBe("in_delivery");
  });
});

describe("tenant isolation", () => {
  it("getEngagement never returns another tenant's engagement (System Design §4)", async () => {
    const { engagement } = await createTenantWithEngagement("lead");
    const { ctx: otherTenantCtx } = await createTenant();

    await expect(getEngagement(otherTenantCtx, engagement.id)).rejects.toThrow();
  });
});
