/**
 * Kickoff Service (System Design §2) — owns KickoffCall, CallSummary,
 * ActionItem (the latter modeled as a jsonb array on CallSummary, not its
 * own table). Implements PRD §11.
 *
 * Stage wiring (System Design §3.1): picking a proposed slot advances
 * onboarding -> kickoff_scheduled; marking the call done advances
 * kickoff_scheduled -> kickoff_done. Both follow the same "only the
 * specific triggering event may advance this transition" rule as every
 * earlier stage in the chain.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import { AIGateway } from "@/lib/ai-gateway";
import { advanceStageAutomatically } from "@/services/engagement";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// Agenda generation
// ─────────────────────────────────────────────────────────────────────────

export interface AgendaSection {
  title: string;
  durationMinutes: number;
  talkingPoints: string[];
}

const agendaSchema = z.object({
  sections: z.array(z.object({
    title: z.string(),
    durationMinutes: z.number(),
    talkingPoints: z.array(z.string()),
  })),
});

const DEFAULT_AGENDA: AgendaSection[] = [
  { title: "Introductions", durationMinutes: 5, talkingPoints: ["Who's on the call, roles"] },
  { title: "Scope recap", durationMinutes: 10, talkingPoints: ["Confirm what was agreed in the proposal"] },
  { title: "Timeline", durationMinutes: 10, talkingPoints: ["Key milestones and dates"] },
  { title: "Next steps", durationMinutes: 10, talkingPoints: ["What each side needs to do before the next check-in"] },
];

async function generateAgenda(tenantId: string, engagementId: string): Promise<AgendaSection[]> {
  const acceptedProposal = await prisma.proposal.findFirst({
    where: { engagementId, status: "accepted" },
    orderBy: { version: "desc" },
  });
  const intakeForm = await prisma.intakeForm.findFirst({ where: { engagementId } });
  const intakeResponse = intakeForm
    ? await prisma.intakeResponse.findFirst({ where: { intakeFormId: intakeForm.id } })
    : null;

  const result = await AIGateway.generate<unknown>({
    task: "kickoff_agenda",
    tenantId,
    engagementId,
    context: {
      scopeSummary: acceptedProposal?.coverNote ?? null,
      intakeAnswers: intakeResponse?.answers ?? null,
    },
    outputSchema: agendaSchema,
  });

  const parsed = agendaSchema.safeParse(result.draft);
  return parsed.success ? parsed.data.sections : DEFAULT_AGENDA;
}

function serializeKickoffCall(call: {
  id: string;
  engagementId: string;
  scheduledAt: Date | null;
  proposedSlots: unknown;
  agenda: unknown;
  recordingUrl: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: call.id,
    engagementId: call.engagementId,
    scheduledAt: call.scheduledAt?.toISOString() ?? null,
    proposedSlots: (call.proposedSlots as string[] | null) ?? [],
    agenda: call.agenda as AgendaSection[] | null,
    recordingUrl: call.recordingUrl,
    status: call.status,
    createdAt: call.createdAt.toISOString(),
  };
}

/** Idempotent like the other onboarding auto-creates: one KickoffCall per engagement. */
export async function scheduleKickoffCall(ctx: TenantContext, engagementId: string, proposedSlots: string[]) {
  return withTenant(ctx, async (tenantId) => {
    const existing = await prisma.kickoffCall.findFirst({ where: { engagementId } });
    if (existing) return serializeKickoffCall(existing);

    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const agenda = await generateAgenda(tenantId, engagementId);

    const call = await prisma.kickoffCall.create({
      data: {
        engagementId,
        proposedSlots: proposedSlots as unknown as Prisma.InputJsonValue,
        agenda: agenda as unknown as Prisma.InputJsonValue,
      },
    });
    return serializeKickoffCall(call);
  });
}

export async function getKickoffCallForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const call = await prisma.kickoffCall.findFirst({ where: { engagementId } });
    return call ? serializeKickoffCall(call) : null;
  });
}

export async function getKickoffCallForOwner(ctx: TenantContext, callId: string) {
  return withTenant(ctx, async (tenantId) => {
    const call = await prisma.kickoffCall.findFirstOrThrow({
      where: { id: callId, engagement: { tenantId } },
      include: { summary: true },
    });
    return {
      ...serializeKickoffCall(call),
      summary: call.summary
        ? { summaryText: call.summary.summaryText, actionItems: call.summary.actionItems as unknown as ActionItem[] }
        : null,
    };
  });
}

export async function updateAgenda(ctx: TenantContext, callId: string, agenda: AgendaSection[]) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.kickoffCall.findFirstOrThrow({ where: { id: callId, engagement: { tenantId } } });
    const updated = await prisma.kickoffCall.update({
      where: { id: callId },
      data: { agenda: agenda as unknown as Prisma.InputJsonValue },
    });
    return serializeKickoffCall(updated);
  });
}

/** Owner marks the client as a no-show — a flag, not a punitive mark (PRD §11). */
export async function markNoShow(ctx: TenantContext, callId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.kickoffCall.findFirstOrThrow({ where: { id: callId, engagement: { tenantId } } });
    const updated = await prisma.kickoffCall.update({ where: { id: callId }, data: { status: "no_show" } });
    return serializeKickoffCall(updated);
  });
}

/** Owner offers a fresh set of slots after a no-show or scheduling conflict. */
export async function rescheduleKickoffCall(ctx: TenantContext, callId: string, proposedSlots: string[]) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.kickoffCall.findFirstOrThrow({ where: { id: callId, engagement: { tenantId } } });
    const updated = await prisma.kickoffCall.update({
      where: { id: callId },
      data: {
        status: "rescheduled",
        scheduledAt: null,
        proposedSlots: proposedSlots as unknown as Prisma.InputJsonValue,
      },
    });
    return serializeKickoffCall(updated);
  });
}

export async function markKickoffDone(ctx: TenantContext, callId: string) {
  return withTenant(ctx, async (tenantId) => {
    const call = await prisma.kickoffCall.findFirstOrThrow({
      where: { id: callId, engagement: { tenantId } },
      include: { engagement: true },
    });
    await prisma.kickoffCall.update({ where: { id: callId }, data: { status: "done" } });

    if (call.engagement.stage === "kickoff_scheduled") {
      await advanceStageAutomatically(ctx, call.engagementId, "kickoff_scheduled");
    }

    return serializeKickoffCall({ ...call, status: "done" });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Public (no login) — slot picking, PRD §11
// ─────────────────────────────────────────────────────────────────────────

export async function getPublicKickoffCall(callId: string) {
  const call = await prisma.kickoffCall.findUniqueOrThrow({
    where: { id: callId },
    include: { engagement: { include: { client: true, tenant: true } } },
  });
  return {
    ...serializeKickoffCall(call),
    businessName: call.engagement.tenant.businessName,
    clientName: call.engagement.client.name,
  };
}

/**
 * Client picks one of the owner's proposed slots. This is the event that
 * advances the engagement off `onboarding` (System Design §3.1) — not
 * scheduleKickoffCall itself, since proposing slots isn't confirmation.
 */
export async function pickKickoffSlot(callId: string, chosenSlot: string) {
  const call = await prisma.kickoffCall.findUniqueOrThrow({
    where: { id: callId },
    include: { engagement: true },
  });

  const slots = (call.proposedSlots as string[] | null) ?? [];
  if (!slots.includes(chosenSlot)) {
    throw new Error("That time isn't one of the proposed slots.");
  }

  await prisma.kickoffCall.update({ where: { id: callId }, data: { scheduledAt: new Date(chosenSlot) } });

  if (call.engagement.stage === "onboarding") {
    await advanceStageAutomatically(new TenantContext(call.engagement.tenantId), call.engagementId, "onboarding");
  }

  return { callId, scheduledAt: chosenSlot };
}

// ─────────────────────────────────────────────────────────────────────────
// Call summary (PRD §11) — optional, never blocks
// ─────────────────────────────────────────────────────────────────────────

export interface ActionItem {
  description: string;
  owner: "agency" | "client";
  done: boolean;
}

const summarySchema = z.object({
  summaryText: z.string(),
  actionItems: z.array(z.object({ description: z.string(), owner: z.enum(["agency", "client"]) })),
});

/**
 * Generates the post-call summary from pasted notes and/or a recording
 * URL. Skipped entirely if the caller provides neither (PRD §11: "No
 * recording/notes provided -> the summary step is simply skipped").
 */
export async function generateCallSummary(
  ctx: TenantContext,
  callId: string,
  input: { notes?: string; recordingUrl?: string },
) {
  return withTenant(ctx, async (tenantId) => {
    const call = await prisma.kickoffCall.findFirstOrThrow({ where: { id: callId, engagement: { tenantId } } });

    if (input.recordingUrl) {
      await prisma.kickoffCall.update({ where: { id: callId }, data: { recordingUrl: input.recordingUrl } });
    }

    const result = await AIGateway.generate<unknown>({
      task: "call_summary",
      tenantId,
      engagementId: call.engagementId,
      context: { notes: input.notes ?? null, recordingUrl: input.recordingUrl ?? null },
      outputSchema: summarySchema,
    });

    const parsed = summarySchema.safeParse(result.draft);
    const summaryText = parsed.success ? parsed.data.summaryText : (typeof result.draft === "string" ? result.draft : "Summary pending — please add notes manually.");
    const actionItems: ActionItem[] = parsed.success
      ? parsed.data.actionItems.map((a) => ({ ...a, done: false }))
      : [];

    const summary = await prisma.callSummary.upsert({
      where: { kickoffCallId: callId },
      create: { kickoffCallId: callId, summaryText, actionItems: actionItems as unknown as Prisma.InputJsonValue },
      update: { summaryText, actionItems: actionItems as unknown as Prisma.InputJsonValue },
    });

    return { summaryText: summary.summaryText, actionItems: summary.actionItems as unknown as ActionItem[] };
  });
}

export async function toggleActionItem(ctx: TenantContext, callId: string, index: number, done: boolean) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.kickoffCall.findFirstOrThrow({ where: { id: callId, engagement: { tenantId } } });
    const summary = await prisma.callSummary.findUniqueOrThrow({ where: { kickoffCallId: callId } });
    const items = summary.actionItems as unknown as ActionItem[];
    if (!items[index]) throw new Error("Action item not found.");
    items[index] = { ...items[index], done };

    const updated = await prisma.callSummary.update({
      where: { kickoffCallId: callId },
      data: { actionItems: items as unknown as Prisma.InputJsonValue },
    });
    return updated.actionItems as unknown as ActionItem[];
  });
}
