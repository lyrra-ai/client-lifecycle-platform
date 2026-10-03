/**
 * Proposal Service (System Design §2) — owns Proposal, ProposalLineItem.
 * Implements PRD §4 (Quote/Proposal Builder). E-sign (PRD §5, EsignEvent)
 * is a separate, later iteration — this service only hands off to it via
 * the public /esign/[proposalId] stub once a proposal is accepted.
 *
 * Follows the pattern in src/services/engagement/index.ts: every exported
 * function takes a TenantContext first and uses withTenant() for all
 * Prisma queries, except the public (no-login) functions which take a
 * bare proposalId — the same pattern already used for the public lead form.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import { AIGateway } from "@/lib/ai-gateway";
import { advanceStageAutomatically } from "@/services/engagement";
import { Prisma, type ProposalStatus } from "@prisma/client";
import { z } from "zod";
import { notifyClient } from "@/lib/integrations/notify";
import { absolutePublicUrl } from "@/lib/public-url";
import { createFollowUpTask, cancelFollowUpTask } from "@/services/followup";
import { generatePublicToken } from "@/lib/public-token";

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

export interface LineItemInput {
  description: string;
  qty: number;
  unitPrice: number; // major units (rupees/dollars) — converted to minor here
  currency: string;
}

// Exported for direct unit testing of the money math (tests/unit/money.test.ts)
// — no DB involved, pure functions.
export function toMinorUnits(unitPrice: number): bigint {
  // All monetary math stored in the smallest unit (PRD §4) to avoid
  // floating-point rounding errors across mixed-currency lines.
  return BigInt(new Prisma.Decimal(unitPrice).times(100).toDecimalPlaces(0).toString());
}

export function lineTotalMinor(item: { qty: Prisma.Decimal | number; unitPriceMinor: bigint }): bigint {
  return BigInt(
    new Prisma.Decimal(item.unitPriceMinor.toString())
      .times(item.qty.toString())
      .toDecimalPlaces(0)
      .toString(),
  );
}

export function computeTotals(lineItems: { qty: Prisma.Decimal; unitPriceMinor: bigint; currency: string }[]) {
  const totals: Record<string, string> = {};
  for (const item of lineItems) {
    const lineTotal = lineTotalMinor(item);
    totals[item.currency] = ((BigInt(totals[item.currency] ?? "0")) + lineTotal).toString();
  }
  return totals;
}

function serializeLineItem(item: {
  id: string;
  description: string;
  qty: Prisma.Decimal;
  unitPriceMinor: bigint;
  currency: string;
}) {
  return {
    id: item.id,
    description: item.description,
    qty: item.qty.toNumber(),
    unitPriceMinor: item.unitPriceMinor.toString(),
    unitPrice: Number(item.unitPriceMinor) / 100,
    currency: item.currency,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Owner-side (authenticated)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Opens the editor for an engagement: returns the current draft if one
 * exists, or starts a new one. If the latest proposal has already been
 * sent, a new version is created (cloning its line items) rather than
 * mutating the sent one — version history is kept, never overwritten
 * silently (PRD §4 edge case).
 */
export async function getOrCreateDraftProposal(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });

    const latest = await prisma.proposal.findFirst({
      where: { engagementId },
      orderBy: { version: "desc" },
      include: { lineItems: true },
    });

    if (!latest) {
      return prisma.proposal.create({
        data: { engagementId, version: 1, publicToken: generatePublicToken() },
        include: { lineItems: true },
      });
    }

    if (latest.status === "draft") {
      return latest;
    }

    return prisma.proposal.create({
      data: {
        engagementId,
        version: latest.version + 1,
        publicToken: generatePublicToken(),
        coverNote: latest.coverNote,
        validUntil: latest.validUntil,
        lineItems: {
          create: latest.lineItems.map((item) => ({
            description: item.description,
            qty: item.qty,
            unitPriceMinor: item.unitPriceMinor,
            currency: item.currency,
          })),
        },
      },
      include: { lineItems: true },
    });
  });
}

export async function getProposalForOwner(ctx: TenantContext, proposalId: string) {
  return withTenant(ctx, async (tenantId) => {
    const proposal = await prisma.proposal.findFirstOrThrow({
      where: { id: proposalId, engagement: { tenantId } },
      include: { lineItems: true, engagement: { include: { client: true } } },
    });
    return {
      id: proposal.id,
      engagementId: proposal.engagementId,
      version: proposal.version,
      status: proposal.status,
      coverNote: proposal.coverNote,
      validUntil: proposal.validUntil?.toISOString() ?? null,
      client: proposal.engagement.client,
      lineItems: proposal.lineItems.map(serializeLineItem),
      totals: computeTotals(proposal.lineItems),
    };
  });
}

/**
 * Replaces the draft's line items and cover note/validity wholesale — only
 * permitted while `status: "draft"`. Editing a proposal that's already
 * been sent goes through getOrCreateDraftProposal first to get a fresh
 * version instead.
 */
export async function updateDraftProposal(
  ctx: TenantContext,
  proposalId: string,
  input: { coverNote?: string; validUntil?: string | null; lineItems: LineItemInput[] },
) {
  return withTenant(ctx, async (tenantId) => {
    const proposal = await prisma.proposal.findFirstOrThrow({
      where: { id: proposalId, engagement: { tenantId } },
    });
    if (proposal.status !== "draft") {
      throw new Error("Only a draft proposal can be edited directly — open a new version instead.");
    }

    await prisma.$transaction([
      prisma.proposalLineItem.deleteMany({ where: { proposalId } }),
      prisma.proposal.update({
        where: { id: proposalId },
        data: {
          coverNote: input.coverNote,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          lineItems: {
            create: input.lineItems.map((item) => ({
              description: item.description,
              qty: item.qty,
              unitPriceMinor: toMinorUnits(item.unitPrice),
              currency: item.currency,
            })),
          },
        },
      }),
    ]);

    return getProposalForOwner(ctx, proposalId);
  });
}

export interface ProposalAIDraft {
  coverNote: string;
  lineItems: { description: string; qty: number; unitPrice: number; currency: string }[];
}

const aiDraftSchema = z.object({
  coverNote: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      qty: z.number(),
      unitPrice: z.number(),
      currency: z.string(),
    }),
  ),
});

/**
 * "Generate with AI" (PRD §4) — never persisted here. The owner reviews
 * and edits the returned draft before it's saved via updateDraftProposal,
 * same as every other AI-touching feature (System Design §1 principle 3).
 */
export async function generateAIDraft(
  ctx: TenantContext,
  engagementId: string,
  brief: string,
): Promise<ProposalAIDraft> {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });

    const result = await AIGateway.generate<unknown>({
      task: "proposal_draft",
      tenantId,
      engagementId,
      context: { brief },
      outputSchema: aiDraftSchema,
    });

    const parsed = aiDraftSchema.safeParse(result.draft);
    if (parsed.success) return parsed.data;

    // Static-fallback adapter (or a malformed AI response) returns a plain
    // string — fall back to it as the cover note with no line items rather
    // than failing the whole draft action (System Design §5's "never block").
    return { coverNote: String(result.draft), lineItems: [] };
  });
}

/**
 * Sends the proposal: status -> sent, advances the Engagement off `lead`
 * if this is its first proposal (System Design §3.1), and attempts to
 * email the client the magic link — falling back to logging/returning the
 * link for the owner to share manually, same dev-fallback pattern as OTP
 * delivery, since WhatsApp/email integrations aren't wired yet.
 */
export async function sendProposal(ctx: TenantContext, proposalId: string) {
  return withTenant(ctx, async (tenantId) => {
    const proposal = await prisma.proposal.findFirstOrThrow({
      where: { id: proposalId, engagement: { tenantId } },
      include: { lineItems: true, engagement: { include: { client: true } } },
    });

    if (proposal.status !== "draft") {
      throw new Error("Only a draft proposal can be sent.");
    }
    if (proposal.lineItems.length === 0) {
      throw new Error("Add at least one line item before sending.");
    }

    await prisma.proposal.update({ where: { id: proposalId }, data: { status: "sent" } });

    if (proposal.engagement.stage === "lead") {
      await advanceStageAutomatically(ctx, proposal.engagementId, "lead");
    }

    // PRD §12: enters the follow-up cadence the moment it's waiting on the client.
    await createFollowUpTask(tenantId, proposal.engagementId, "proposal", proposalId);

    const publicUrl = `/p/${proposal.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = proposal.engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "proposal_ready",
        templateParams: [client.name, absolutePublicUrl(publicUrl)],
      },
      email: {
        subject: "Your proposal is ready",
        html: `<p>View and accept your proposal: <a href="${absolutePublicUrl(publicUrl)}">${absolutePublicUrl(publicUrl)}</a></p>`,
      },
      devLabel: "proposal link",
    });

    return { proposalId, publicUrl, emailed, whatsapped };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Public (no login) — client-facing proposal view, PRD §4
// ─────────────────────────────────────────────────────────────────────────

/** `token` is the public-facing identifier (Proposal.publicToken), never the raw id. */
export async function getPublicProposal(token: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { publicToken: token },
    include: {
      lineItems: true,
      engagement: { include: { client: true, tenant: true } },
    },
  });

  let status: ProposalStatus = proposal.status;
  const isExpired = Boolean(
    proposal.validUntil &&
      proposal.validUntil < new Date() &&
      (status === "sent" || status === "viewed"),
  );

  if (isExpired) {
    status = "expired";
    await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "expired" } });
    // PRD §4: an intentionally expired quote should not keep getting nudged.
    await cancelFollowUpTask("proposal", proposal.id);
  } else if (status === "sent") {
    status = "viewed";
    await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "viewed" } });
  }

  return {
    id: proposal.publicToken, // the client's frontend keeps calling this "id" for subsequent requests
    status,
    coverNote: proposal.coverNote,
    validUntil: proposal.validUntil,
    businessName: proposal.engagement.tenant.businessName,
    clientName: proposal.engagement.client.name,
    lineItems: proposal.lineItems.map(serializeLineItem),
    totals: computeTotals(proposal.lineItems),
  };
}

export async function declineProposal(token: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { publicToken: token } });
  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    throw new Error("This proposal can no longer be declined.");
  }
  const updated = await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "declined" } });
  // PRD §5: a decline is a clear answer, not something to keep chasing.
  await cancelFollowUpTask("proposal", proposal.id);
  return updated;
}
