/**
 * Engagement Service (System Design §2) — owns Client and Engagement, the
 * lifecycle state machine (System Design §3.1). Every other service reads
 * engagement state from here; this is the reference pattern every other
 * bounded-context service module should follow:
 *   - accepts a TenantContext first, uses withTenant() for every query
 *   - stage transitions go through advanceStage()/revertStage() only,
 *     never a direct Prisma update elsewhere in the codebase, so the
 *     "no auto-advance without the triggering event" rule (§3.1) and the
 *     "no draft auto-sent" rule (§5) both stay enforceable in one place.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import type { EngagementStage } from "@prisma/client";

// System Design §3.1 — the only legal forward transitions, each gated by
// its triggering event. The job/webhook handler that fires an automatic
// transition must name itself honestly here; nothing moves "paid" on a
// client-side click.
const AUTOMATIC_NEXT_STAGE: Partial<Record<EngagementStage, EngagementStage>> = {
  lead: "proposal_sent",
  proposal_sent: "proposal_accepted",
  proposal_accepted: "deposit_invoiced",
  deposit_invoiced: "deposit_paid",
  deposit_paid: "onboarding",
  onboarding: "kickoff_scheduled",
  kickoff_scheduled: "kickoff_done",
  kickoff_done: "in_delivery",
  in_delivery: "feedback_requested",
  feedback_requested: "handed_over",
  handed_over: "closed",
};

export function listEngagements(ctx: TenantContext) {
  return withTenant(ctx, (tenantId) =>
    prisma.engagement.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    }),
  );
}

export function getEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, (tenantId) =>
    prisma.engagement.findFirstOrThrow({
      where: { id: engagementId, tenantId },
    }),
  );
}

/**
 * Automatic stage advance — called only from the specific event handler
 * that is allowed to trigger it (e.g. the Razorpay webhook calls this for
 * deposit_invoiced -> deposit_paid; nothing else may call it for that pair).
 */
export async function advanceStageAutomatically(
  ctx: TenantContext,
  engagementId: string,
  expectedCurrentStage: EngagementStage,
) {
  return withTenant(ctx, async (tenantId) => {
    const nextStage = AUTOMATIC_NEXT_STAGE[expectedCurrentStage];
    if (!nextStage) {
      throw new Error(`No automatic transition defined from stage "${expectedCurrentStage}".`);
    }

    return prisma.$transaction(async (tx) => {
      const engagement = await tx.engagement.findFirstOrThrow({
        where: { id: engagementId, tenantId, stage: expectedCurrentStage },
      });

      const updated = await tx.engagement.update({
        where: { id: engagement.id },
        data: { stage: nextStage },
      });

      await tx.engagementStageLog.create({
        data: {
          engagementId: engagement.id,
          fromStage: expectedCurrentStage,
          toStage: nextStage,
          automatic: true,
        },
      });

      return updated;
    });
  });
}

/**
 * Manual stage change — an agency owner can advance or revert a stage at
 * will, but it is always logged with a reason (System Design §3.1): real
 * engagements don't move linearly and the tool must not fight the owner's
 * judgment call.
 */
export async function setStageManually(
  ctx: TenantContext,
  engagementId: string,
  toStage: EngagementStage,
  reason: string,
) {
  if (!reason.trim()) {
    throw new Error("A manual stage change requires a reason.");
  }

  return withTenant(ctx, (tenantId) =>
    prisma.$transaction(async (tx) => {
      const engagement = await tx.engagement.findFirstOrThrow({
        where: { id: engagementId, tenantId },
      });

      const updated = await tx.engagement.update({
        where: { id: engagement.id },
        data: { stage: toStage },
      });

      await tx.engagementStageLog.create({
        data: {
          engagementId: engagement.id,
          fromStage: engagement.stage,
          toStage,
          reason,
          automatic: false,
        },
      });

      return updated;
    }),
  );
}
