/**
 * Follow-up Engine (System Design §6, PRD §12) — the single most important
 * automation in the product. One engine handles every "waiting on client"
 * target type (proposal/invoice/intake_form/access_request), not four
 * separate reminder systems.
 *
 * Design note on FollowUpTask.status (pending/sent/stopped — fixed by the
 * schema): one row represents the whole nudge *series* for a target, not
 * one attempt. `pending` means the series is active (whether or not a
 * draft is currently sitting ready); `stopped` is terminal — covering
 * auto-cancel on target resolution, max-nudges-exceeded (System Design
 * §6's "stop and alert the owner"), and the PRD §12 edge case of the
 * owner manually resolving a task after an off-platform reply. `sent`
 * is intentionally never used as a resting value in this design.
 *
 * Callers (proposal/billing/onboarding services) create a task the moment
 * their target enters a waiting state and cancel it the moment that
 * target resolves — this module never polls those services itself, it
 * only knows about the generic (engagementId, targetType, targetId) shape.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import { AIGateway } from "@/lib/ai-gateway";
import { sendEmail } from "@/lib/integrations/email";
import type { FollowUpTargetType } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

// PRD §14: feedback requests get exactly one nudge, then stop — "valuable
// but not worth damaging a completed relationship by nagging." Every other
// target type uses the standard day 2/5/9, up-to-3 cadence (System Design §6).
function defaultRule(targetType: FollowUpTargetType) {
  if (targetType === "feedback_request") {
    return { nudgeDaysAfter: [3], maxNudges: 1 };
  }
  return { nudgeDaysAfter: [2, 5, 9], maxNudges: 3 };
}

async function getRule(tenantId: string, targetType: FollowUpTargetType) {
  const rule = await prisma.followUpRule.findUnique({ where: { tenantId_targetType: { tenantId, targetType } } });
  const fallback = defaultRule(targetType);
  return {
    nudgeDaysAfter: rule?.nudgeDaysAfter ?? fallback.nudgeDaysAfter,
    maxNudges: rule?.maxNudges ?? fallback.maxNudges,
  };
}

/**
 * Called by the owning service the moment its target enters a waiting
 * state. Idempotent — a second call for the same target is a no-op if an
 * active (pending) task already exists.
 */
export async function createFollowUpTask(
  tenantId: string,
  engagementId: string,
  targetType: FollowUpTargetType,
  targetId: string,
) {
  const existing = await prisma.followUpTask.findFirst({ where: { targetType, targetId, status: "pending" } });
  if (existing) return existing;

  const rule = await getRule(tenantId, targetType);
  const nextRunAt = new Date(Date.now() + rule.nudgeDaysAfter[0]! * DAY_MS);

  return prisma.followUpTask.create({
    data: { engagementId, targetType, targetId, nextRunAt, triggerRule: JSON.stringify(rule) },
  });
}

/** Called by the owning service the moment its target resolves. */
export async function cancelFollowUpTask(targetType: FollowUpTargetType, targetId: string) {
  await prisma.followUpTask.updateMany({
    where: { targetType, targetId, status: "pending" },
    data: { status: "stopped" },
  });
}

function describeTarget(targetType: FollowUpTargetType): string {
  return {
    proposal: "their proposal",
    invoice: "an invoice",
    intake_form: "the intake form",
    access_request: "an access request",
    feedback_request: "the feedback request",
  }[targetType];
}

/**
 * Worker entry point (pg-boss, same pattern as reconcilePendingInvoices):
 * drafts a nudge for every due task that doesn't already have one ready,
 * with tone escalating by attempt number. Never advances nextRunAt or
 * attempts here — that only happens once the owner actually sends
 * (reviewAndSendFollowUp), since a draft sitting unreviewed isn't a sent
 * nudge.
 */
export async function processDueFollowUps() {
  const due = await prisma.followUpTask.findMany({
    where: {
      status: "pending",
      nextRunAt: { lte: new Date() },
      draftMessage: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    },
    include: { engagement: { include: { client: true, tenant: true } } },
  });

  let drafted = 0;
  for (const task of due) {
    const daysOutstanding = Math.floor((Date.now() - task.createdAt.getTime()) / DAY_MS);
    const result = await AIGateway.generate<string>({
      task: "followup_message",
      tenantId: task.engagement.tenantId,
      engagementId: task.engagementId,
      context: {
        clientName: task.engagement.client.name,
        what: describeTarget(task.targetType),
        daysOutstanding,
        attemptNumber: task.attempts + 1,
      },
      outputSchema: undefined,
    });
    const draftMessage =
      typeof result.draft === "string" && result.draft.trim()
        ? result.draft
        : `Hi ${task.engagement.client.name}, just checking in on ${describeTarget(task.targetType)} — let us know if you have any questions.`;

    await prisma.followUpTask.update({ where: { id: task.id }, data: { draftMessage } });
    drafted += 1;
  }

  return { checked: due.length, drafted };
}

export interface FollowUpTaskRow {
  id: string;
  engagementId: string;
  clientName: string;
  targetType: string;
  attempts: number;
  daysOutstanding: number;
  draftMessage: string | null;
  snoozedUntil: string | null;
  snoozeReason: string | null;
}

/** The dashboard's "Needs Follow-up" list — every open task across all engagements, most overdue first. */
export async function listFollowUpTasksForOwner(ctx: TenantContext): Promise<FollowUpTaskRow[]> {
  return withTenant(ctx, async (tenantId) => {
    const tasks = await prisma.followUpTask.findMany({
      where: { status: "pending", engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
      orderBy: { nextRunAt: "asc" },
    });
    return tasks.map((t) => ({
      id: t.id,
      engagementId: t.engagementId,
      clientName: t.engagement.client.name,
      targetType: t.targetType,
      attempts: t.attempts,
      daysOutstanding: Math.floor((Date.now() - t.createdAt.getTime()) / DAY_MS),
      draftMessage: t.draftMessage,
      snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
      snoozeReason: t.snoozeReason,
    }));
  });
}

/**
 * Owner approves (optionally edited) and sends — never auto-sent (System
 * Design §1 principle 3). Advances the series to the next cadence day, or
 * stops it if maxNudges is now reached.
 */
export async function reviewAndSendFollowUp(ctx: TenantContext, taskId: string, finalMessage: string) {
  return withTenant(ctx, async (tenantId) => {
    const task = await prisma.followUpTask.findFirstOrThrow({
      where: { id: taskId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });
    if (task.status !== "pending") {
      throw new Error("This follow-up is no longer active.");
    }

    const rule = await getRule(tenantId, task.targetType);
    const attempts = task.attempts + 1;
    const stop = attempts >= rule.maxNudges;

    let emailed = false;
    const clientEmail = task.engagement.client.email;
    if (clientEmail) {
      try {
        await sendEmail({ tenantId, to: clientEmail, subject: "Just checking in", html: `<p>${finalMessage}</p>` });
        emailed = true;
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[dev] follow-up nudge for ${clientEmail}: ${finalMessage}`);
        } else {
          throw err;
        }
      }
    }

    await prisma.followUpTask.update({
      where: { id: taskId },
      data: stop
        ? { status: "stopped", attempts, draftMessage: null }
        : {
            attempts,
            draftMessage: null,
            nextRunAt: new Date(Date.now() + (rule.nudgeDaysAfter[attempts] ?? rule.nudgeDaysAfter.at(-1)!) * DAY_MS),
          },
    });

    return { emailed, stopped: stop };
  });
}

/** PRD §12: a snooze with a reason, not a binary on/off. */
export async function snoozeFollowUpTask(ctx: TenantContext, taskId: string, until: string, reason: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.followUpTask.findFirstOrThrow({ where: { id: taskId, engagement: { tenantId } } });
    await prisma.followUpTask.update({
      where: { id: taskId },
      data: { snoozedUntil: new Date(until), snoozeReason: reason },
    });
  });
}

/** PRD §12 edge case: client responded off-platform; the system can't detect that automatically. */
export async function markFollowUpResolvedManually(ctx: TenantContext, taskId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.followUpTask.findFirstOrThrow({ where: { id: taskId, engagement: { tenantId } } });
    await prisma.followUpTask.update({ where: { id: taskId }, data: { status: "stopped" } });
  });
}

export async function getFollowUpRules(ctx: TenantContext) {
  return withTenant(ctx, async (tenantId) => {
    const rules = await prisma.followUpRule.findMany({ where: { tenantId } });
    const targetTypes: FollowUpTargetType[] = ["proposal", "invoice", "intake_form", "access_request", "feedback_request"];
    return targetTypes.map((targetType) => {
      const existing = rules.find((r) => r.targetType === targetType);
      const fallback = defaultRule(targetType);
      return {
        targetType,
        nudgeDaysAfter: existing?.nudgeDaysAfter ?? fallback.nudgeDaysAfter,
        maxNudges: existing?.maxNudges ?? fallback.maxNudges,
      };
    });
  });
}

export async function updateFollowUpRule(
  ctx: TenantContext,
  targetType: FollowUpTargetType,
  input: { nudgeDaysAfter: number[]; maxNudges: number },
) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.followUpRule.upsert({
      where: { tenantId_targetType: { tenantId, targetType } },
      create: { tenantId, targetType, ...input },
      update: input,
    });
  });
}
