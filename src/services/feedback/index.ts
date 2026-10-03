/**
 * Feedback Service (System Design §2) — owns FeedbackRequest,
 * FeedbackResponse, HandoverPacket. Implements PRD §14.
 *
 * Triggered manually by the owner when delivery is complete, never by a
 * date (PRD §14: "real projects don't end on a fixed schedule"). Unlike
 * the one-per-engagement onboarding artifacts, FeedbackRequest is
 * deliberately NOT idempotent — retainer/ongoing engagements use this
 * per-milestone, so multiple requests over the life of one engagement are
 * expected, not a bug.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import { AIGateway } from "@/lib/ai-gateway";
import { advanceStageAutomatically } from "@/services/engagement";
import { notifyClient } from "@/lib/integrations/notify";
import { createFollowUpTask, cancelFollowUpTask } from "@/services/followup";
import type { Prisma } from "@prisma/client";
import { generatePublicToken } from "@/lib/public-token";
import { getSignedDownloadUrl } from "@/lib/storage/s3";

async function maybeCloseEngagement(engagementId: string) {
  const engagement = await prisma.engagement.findUniqueOrThrow({ where: { id: engagementId } });
  if (engagement.stage !== "handed_over") return;

  const hasResponse = await prisma.feedbackResponse.findFirst({
    where: { feedbackRequest: { engagementId } },
  });
  if (!hasResponse) return;

  await advanceStageAutomatically(new TenantContext(engagement.tenantId), engagementId, "handed_over");
}

// ─────────────────────────────────────────────────────────────────────────
// Feedback request (PRD §14)
// ─────────────────────────────────────────────────────────────────────────

export async function createFeedbackRequest(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    const engagement = await prisma.engagement.findFirstOrThrow({
      where: { id: engagementId, tenantId },
      include: { client: true },
    });

    const request = await prisma.feedbackRequest.create({ data: { engagementId, publicToken: generatePublicToken() } });

    // First request on this engagement advances the stage; a later one
    // (per-milestone retainer use) is a legitimate repeat, not an error.
    if (engagement.stage === "in_delivery") {
      await advanceStageAutomatically(ctx, engagementId, "in_delivery");
    }

    await createFollowUpTask(tenantId, engagementId, "feedback_request", request.id);

    const publicUrl = `/feedback/${request.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "feedback_request",
        templateParams: [client.name, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${publicUrl}`],
      },
      email: {
        subject: "How did we do?",
        html: `<p>We'd love your feedback: <a href="${publicUrl}">${publicUrl}</a></p>`,
      },
      devLabel: "feedback request link",
    });

    return { requestId: request.id, requestToken: request.publicToken, publicUrl, emailed, whatsapped };
  });
}

export async function listFeedbackRequestsForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const requests = await prisma.feedbackRequest.findMany({
      where: { engagementId },
      include: { response: true },
      orderBy: { sentAt: "desc" },
    });
    return requests.map((r) => ({
      id: r.id,
      sentAt: r.sentAt.toISOString(),
      response: r.response ? { rating: r.response.rating, comments: r.response.comments } : null,
    }));
  });
}

export async function getPublicFeedbackRequest(token: string) {
  const request = await prisma.feedbackRequest.findUniqueOrThrow({
    where: { publicToken: token },
    include: { engagement: { include: { client: true, tenant: true } }, response: true },
  });
  return {
    id: request.publicToken,
    businessName: request.engagement.tenant.businessName,
    clientName: request.engagement.client.name,
    alreadySubmitted: Boolean(request.response),
  };
}

export async function submitFeedbackResponse(token: string, rating: number, comments?: string) {
  const request = await prisma.feedbackRequest.findUniqueOrThrow({
    where: { publicToken: token },
    include: { response: true },
  });
  if (request.response) {
    throw new Error("Feedback has already been submitted for this request.");
  }
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }

  const response = await prisma.feedbackResponse.create({
    data: { feedbackRequestId: request.id, rating, comments },
  });

  await cancelFollowUpTask("feedback_request", request.id);
  await maybeCloseEngagement(request.engagementId);

  return { id: response.id };
}

// ─────────────────────────────────────────────────────────────────────────
// Handover packet (PRD §14)
// ─────────────────────────────────────────────────────────────────────────

/** Stored shape — storageKey is the S3 object key, never exposed directly. */
export interface Deliverable {
  fileName: string;
  storageKey: string;
}

/**
 * Serialized shape — keeps storageKey (the owner editor round-trips it on
 * save/remove) alongside a signed, time-boxed download url resolved fresh on
 * every read. The public handover page (getPublicHandoverPacket) strips
 * storageKey before returning to an unauthenticated caller.
 */
export interface SerializedDeliverable extends Deliverable {
  url: string;
}

async function serializeDeliverables(deliverables: Deliverable[]): Promise<SerializedDeliverable[]> {
  return Promise.all(
    deliverables.map(async (d) => ({ ...d, url: await getSignedDownloadUrl(d.storageKey) })),
  );
}

async function serializeHandoverPacket(packet: {
  id: string;
  engagementId: string;
  deliverables: unknown;
  summary: string;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: packet.id,
    engagementId: packet.engagementId,
    deliverables: await serializeDeliverables((packet.deliverables as Deliverable[] | null) ?? []),
    summary: packet.summary,
    sentAt: packet.sentAt?.toISOString() ?? null,
    createdAt: packet.createdAt.toISOString(),
  };
}

const FALLBACK_SUMMARY = "Project delivered. Full details available on request.";

/** One packet per engagement, like the onboarding artifacts — idempotent. */
export async function createHandoverPacket(
  ctx: TenantContext,
  engagementId: string,
  input: { deliverables: Deliverable[]; ownerNotes?: string },
) {
  return withTenant(ctx, async (tenantId) => {
    const existing = await prisma.handoverPacket.findFirst({ where: { engagementId } });
    if (existing) return serializeHandoverPacket(existing);

    const acceptedProposal = await prisma.proposal.findFirst({
      where: { engagementId, status: "accepted" },
      orderBy: { version: "desc" },
    });

    const result = await AIGateway.generate<string>({
      task: "handover_summary",
      tenantId,
      engagementId,
      context: {
        scopeSummary: acceptedProposal?.coverNote ?? null,
        deliverables: input.deliverables.map((d) => d.fileName),
        ownerNotes: input.ownerNotes ?? null,
      },
      outputSchema: undefined,
    });
    const summary = typeof result.draft === "string" && result.draft.trim() ? result.draft : FALLBACK_SUMMARY;

    const packet = await prisma.handoverPacket.create({
      data: {
        engagementId,
        deliverables: input.deliverables as unknown as Prisma.InputJsonValue,
        summary,
        publicToken: generatePublicToken(),
      },
    });
    return serializeHandoverPacket(packet);
  });
}

export async function getHandoverPacketForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const packet = await prisma.handoverPacket.findFirst({ where: { engagementId } });
    return packet ? serializeHandoverPacket(packet) : null;
  });
}

export async function getHandoverPacketForOwner(ctx: TenantContext, packetId: string) {
  return withTenant(ctx, async (tenantId) => {
    const packet = await prisma.handoverPacket.findFirstOrThrow({
      where: { id: packetId, engagement: { tenantId } },
    });
    return serializeHandoverPacket(packet);
  });
}

export async function updateHandoverPacket(
  ctx: TenantContext,
  packetId: string,
  input: { deliverables: Deliverable[]; summary: string },
) {
  return withTenant(ctx, async (tenantId) => {
    const packet = await prisma.handoverPacket.findFirstOrThrow({
      where: { id: packetId, engagement: { tenantId } },
    });
    if (packet.sentAt) {
      throw new Error("Only an unsent handover packet can be edited.");
    }
    const updated = await prisma.handoverPacket.update({
      where: { id: packetId },
      data: { deliverables: input.deliverables as unknown as Prisma.InputJsonValue, summary: input.summary },
    });
    return serializeHandoverPacket(updated);
  });
}

/**
 * Sending advances feedback_requested -> handed_over, then immediately
 * checks whether feedback was already collected (order-independent close,
 * PRD §14: "moves to handed_over then closed once both are sent/collected").
 */
export async function sendHandoverPacket(ctx: TenantContext, packetId: string) {
  return withTenant(ctx, async (tenantId) => {
    const packet = await prisma.handoverPacket.findFirstOrThrow({
      where: { id: packetId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });
    if (packet.sentAt) {
      throw new Error("This handover packet has already been sent.");
    }

    await prisma.handoverPacket.update({ where: { id: packetId }, data: { sentAt: new Date() } });

    if (packet.engagement.stage === "feedback_requested") {
      await advanceStageAutomatically(ctx, packet.engagementId, "feedback_requested");
    }
    await maybeCloseEngagement(packet.engagementId);

    const publicUrl = `/handover/${packet.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = packet.engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "handover_ready",
        templateParams: [client.name, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${publicUrl}`],
      },
      email: {
        subject: "Your project handover",
        html: `<p>Here's your handover packet: <a href="${publicUrl}">${publicUrl}</a></p>`,
      },
      devLabel: "handover packet link",
    });

    return { packetId, publicUrl, emailed, whatsapped };
  });
}

export async function getPublicHandoverPacket(token: string) {
  const packet = await prisma.handoverPacket.findUniqueOrThrow({
    where: { publicToken: token },
    include: { engagement: { include: { client: true, tenant: true } } },
  });
  const serialized = await serializeHandoverPacket(packet);
  return {
    ...serialized,
    // storageKey is an internal S3 object key — never expose it to the unauthenticated public page.
    deliverables: serialized.deliverables.map(({ fileName, url }) => ({ fileName, url })),
    id: packet.publicToken,
    businessName: packet.engagement.tenant.businessName,
    clientName: packet.engagement.client.name,
  };
}
