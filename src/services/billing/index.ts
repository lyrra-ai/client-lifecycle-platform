/**
 * Billing Service (System Design §2) — owns Invoice, Payment. Deterministic,
 * no AI involvement. Implements PRD §6 (Deposit/Milestone Invoice).
 *
 * Follows the pattern in src/services/engagement/index.ts: every owner-side
 * function takes a TenantContext first and uses withTenant() for all
 * Prisma queries; public (no-login) functions take a bare invoiceId, same
 * as the rest of this codebase's public surface (proposal, esign).
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import { Prisma, type InvoiceType, type PaymentMethod } from "@prisma/client";
import { advanceStageAutomatically } from "@/services/engagement";
import { computeTotals } from "@/services/proposal";
import { notifyClient } from "@/lib/integrations/notify";
import { getRazorpayClient } from "@/lib/integrations/razorpay";
import { autoCreateWelcomeDoc, autoCreateIntakeForm } from "@/services/onboarding";
import { createFollowUpTask, cancelFollowUpTask } from "@/services/followup";
import { generatePublicToken } from "@/lib/public-token";

// ─────────────────────────────────────────────────────────────────────────
// GST (System Design §4) — deterministic, no AI.
// ─────────────────────────────────────────────────────────────────────────

const GST_RATE_PERCENT = 18;
const DEFAULT_HSN_SAC = "9983"; // Other professional, technical & business services — generic v1 default

export interface GstBreakup {
  [key: string]: string | undefined;
  cgst?: string;
  sgst?: string;
  igst?: string;
  hsnSac: string;
}

function normalizeState(state: string): string {
  return state.trim().toLowerCase();
}

/**
 * Returns null (rather than guessing) when either state is unknown — the
 * caller decides what that means (gstApplicable stays false until both
 * states are on file).
 */
export function computeGstBreakup(
  amountMinor: bigint,
  tenantState: string | null | undefined,
  clientState: string | null | undefined,
): GstBreakup | null {
  if (!tenantState || !clientState) return null;

  const amount = new Prisma.Decimal(amountMinor.toString());
  const sameState = normalizeState(tenantState) === normalizeState(clientState);

  if (sameState) {
    const half = amount.times(GST_RATE_PERCENT / 2).dividedBy(100).toDecimalPlaces(0);
    return { cgst: half.toString(), sgst: half.toString(), hsnSac: DEFAULT_HSN_SAC };
  }

  const igst = amount.times(GST_RATE_PERCENT).dividedBy(100).toDecimalPlaces(0);
  return { igst: igst.toString(), hsnSac: DEFAULT_HSN_SAC };
}

function serializeInvoice(invoice: {
  id: string;
  engagementId: string;
  publicToken: string;
  type: InvoiceType;
  amountMinor: bigint;
  currency: string;
  gstApplicable: boolean;
  gstBreakup: Prisma.JsonValue;
  status: string;
  dueDate: Date | null;
}) {
  return {
    id: invoice.id,
    engagementId: invoice.engagementId,
    publicToken: invoice.publicToken,
    type: invoice.type,
    amountMinor: invoice.amountMinor.toString(),
    amount: Number(invoice.amountMinor) / 100,
    currency: invoice.currency,
    gstApplicable: invoice.gstApplicable,
    gstBreakup: invoice.gstBreakup as GstBreakup | null,
    status: invoice.status,
    dueDate: invoice.dueDate?.toISOString() ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Owner-side (authenticated)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Auto-drafts one deposit invoice per currency present in the accepted
 * proposal's line items (PRD §6) — so a mixed INR/USD proposal gets one
 * invoice per currency, each independently trackable (same model the PRD
 * uses for a manual multi-milestone split). Idempotent: calling this twice
 * for the same engagement returns the invoices already created instead of
 * duplicating them.
 */
export async function autoCreateDepositInvoices(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    const existing = await prisma.invoice.findMany({
      where: { engagementId, type: "deposit" },
    });
    if (existing.length > 0) return existing.map(serializeInvoice);

    const engagement = await prisma.engagement.findFirstOrThrow({
      where: { id: engagementId, tenantId },
      include: { client: true },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const acceptedProposal = await prisma.proposal.findFirst({
      where: { engagementId, status: "accepted" },
      include: { lineItems: true },
      orderBy: { version: "desc" },
    });
    if (!acceptedProposal) {
      throw new Error("No accepted proposal found for this engagement.");
    }

    const totals = computeTotals(acceptedProposal.lineItems);
    const gstEligible = Boolean(tenant.gstNumber) && Boolean(tenant.state) && Boolean(engagement.client.state);

    const created = await Promise.all(
      Object.entries(totals).map(([currency, totalMinorStr]) => {
        const totalMinor = BigInt(totalMinorStr);
        const depositMinor = BigInt(
          new Prisma.Decimal(totalMinor.toString())
            .times(tenant.defaultDepositPercent)
            .dividedBy(100)
            .toDecimalPlaces(0)
            .toString(),
        );
        const gstBreakup = gstEligible
          ? computeGstBreakup(depositMinor, tenant.state, engagement.client.state)
          : null;

        return prisma.invoice.create({
          data: {
            engagementId,
            type: "deposit",
            amountMinor: depositMinor,
            currency,
            gstApplicable: gstEligible,
            gstBreakup: gstBreakup ?? undefined,
            publicToken: generatePublicToken(),
          },
        });
      }),
    );

    return created.map(serializeInvoice);
  });
}

export function listInvoicesForOwner(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const invoices = await prisma.invoice.findMany({
      where: { engagementId },
      orderBy: { createdAt: "asc" },
    });
    return invoices.map(serializeInvoice);
  });
}

/** Dashboard's "how much is owed to me right now" (PRD §15), grouped by currency. */
export function getOutstandingInvoicesTotal(ctx: TenantContext) {
  return withTenant(ctx, async (tenantId) => {
    const unpaid = await prisma.invoice.findMany({
      where: { engagement: { tenantId }, status: "sent" },
      select: { amountMinor: true, currency: true },
    });
    const totals: Record<string, string> = {};
    for (const inv of unpaid) {
      totals[inv.currency] = ((BigInt(totals[inv.currency] ?? "0")) + inv.amountMinor).toString();
    }
    return totals;
  });
}

export async function getInvoiceForOwner(ctx: TenantContext, invoiceId: string) {
  return withTenant(ctx, async (tenantId) => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, engagement: { tenantId } },
    });
    return serializeInvoice(invoice);
  });
}

/**
 * Manual milestone/final invoice (PRD §6: owner can split one proposal
 * into multiple Invoice records against one Engagement).
 */
export async function createManualInvoice(
  ctx: TenantContext,
  engagementId: string,
  input: { type: InvoiceType; amountMajor: number; currency: string; gstApplicable: boolean; dueDate?: string | null },
) {
  return withTenant(ctx, async (tenantId) => {
    const engagement = await prisma.engagement.findFirstOrThrow({
      where: { id: engagementId, tenantId },
      include: { client: true },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const amountMinor = BigInt(new Prisma.Decimal(input.amountMajor).times(100).toDecimalPlaces(0).toString());
    const gstBreakup = input.gstApplicable
      ? computeGstBreakup(amountMinor, tenant.state, engagement.client.state)
      : null;

    const invoice = await prisma.invoice.create({
      data: {
        engagementId,
        type: input.type,
        amountMinor,
        currency: input.currency,
        gstApplicable: input.gstApplicable,
        gstBreakup: gstBreakup ?? undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        publicToken: generatePublicToken(),
      },
    });
    return serializeInvoice(invoice);
  });
}

/**
 * Only permitted while `status: "draft"` — a sent invoice can't be edited
 * (PRD §6), only voided and reissued.
 */
export async function updateDraftInvoice(
  ctx: TenantContext,
  invoiceId: string,
  input: { amountMajor?: number; gstApplicable?: boolean; dueDate?: string | null },
) {
  return withTenant(ctx, async (tenantId) => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });
    if (invoice.status !== "draft") {
      throw new Error("Only a draft invoice can be edited — void and reissue instead.");
    }
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const amountMinor =
      input.amountMajor !== undefined
        ? BigInt(new Prisma.Decimal(input.amountMajor).times(100).toDecimalPlaces(0).toString())
        : invoice.amountMinor;
    const gstApplicable = input.gstApplicable ?? invoice.gstApplicable;
    const gstBreakup = gstApplicable
      ? computeGstBreakup(amountMinor, tenant.state, invoice.engagement.client.state)
      : null;

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountMinor,
        gstApplicable,
        gstBreakup: gstBreakup ?? Prisma.JsonNull,
        dueDate: input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate) : null) : invoice.dueDate,
      },
    });
    return serializeInvoice(updated);
  });
}

/**
 * Sending the first invoice on an engagement advances it off
 * `proposal_accepted` (System Design §3.1) — same "only the responsible
 * event handler advances this transition" rule as sendProposal.
 */
export async function sendInvoice(ctx: TenantContext, invoiceId: string) {
  return withTenant(ctx, async (tenantId) => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });
    if (invoice.status !== "draft") {
      throw new Error("Only a draft invoice can be sent.");
    }
    if (invoice.amountMinor <= 0n) {
      throw new Error("Invoice amount must be greater than zero.");
    }

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "sent" } });

    if (invoice.engagement.stage === "proposal_accepted") {
      await advanceStageAutomatically(ctx, invoice.engagementId, "proposal_accepted");
    }

    // PRD §12: enters the follow-up cadence the moment it's waiting on the client.
    await createFollowUpTask(tenantId, invoice.engagementId, "invoice", invoiceId);

    const publicUrl = `/i/${invoice.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = invoice.engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "invoice_ready",
        templateParams: [client.name, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${publicUrl}`],
      },
      email: {
        subject: "Your invoice is ready",
        html: `<p>View and pay your invoice: <a href="${publicUrl}">${publicUrl}</a></p>`,
      },
      devLabel: "invoice link",
    });

    return { invoiceId, publicUrl, emailed, whatsapped };
  });
}

/**
 * Voiding preserves the audit trail (PRD §6) — a correction is a new
 * invoice, never a silent edit of a sent one. Paid invoices can't be
 * voided through this path; that's out of scope for v1.
 */
export async function voidInvoice(ctx: TenantContext, invoiceId: string) {
  return withTenant(ctx, async (tenantId) => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, engagement: { tenantId } },
    });
    if (invoice.status !== "sent") {
      throw new Error("Only a sent invoice can be voided.");
    }
    const updated = await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "void" } });
    await cancelFollowUpTask("invoice", invoiceId);
    return serializeInvoice(updated);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Public (no login) — client-facing invoice view, PRD §6
// ─────────────────────────────────────────────────────────────────────────

/** `token` is the public-facing identifier (Invoice.publicToken), never the raw id. */
export async function getPublicInvoice(token: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { publicToken: token },
    include: { engagement: { include: { client: true, tenant: true } } },
  });

  return {
    ...serializeInvoice(invoice),
    id: invoice.publicToken, // the client's frontend keeps calling this "id" for subsequent requests
    businessName: invoice.engagement.tenant.businessName,
    clientName: invoice.engagement.client.name,
  };
}

export async function getPublicPaymentStatus(token: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { publicToken: token } });
  return { status: invoice.status };
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Collection (PRD §7) — Razorpay is the ONLY place that touches
// payments (System Design §4). The webhook (recordPaymentFromRazorpay) is
// the single source of truth for "paid" — never a client-side event.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Creates a Razorpay Order for this invoice's exact amount/currency, or
 * returns the existing one if "Pay Now" has already been clicked once —
 * never creates a second order for the same invoice.
 */
export async function createRazorpayOrderForInvoice(token: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { publicToken: token } });
  if (invoice.status !== "sent") {
    throw new Error("Only a sent invoice can be paid.");
  }

  if (invoice.razorpayOrderId) {
    return {
      orderId: invoice.razorpayOrderId,
      amountMinor: invoice.amountMinor.toString(),
      currency: invoice.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    };
  }

  const order = await getRazorpayClient().orders.create({
    amount: Number(invoice.amountMinor),
    currency: invoice.currency,
    receipt: invoice.id,
    notes: { invoiceId: invoice.id },
  });

  await prisma.invoice.update({ where: { id: invoice.id }, data: { razorpayOrderId: order.id } });

  return {
    orderId: order.id,
    amountMinor: invoice.amountMinor.toString(),
    currency: invoice.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

function mapRazorpayMethod(method: string): PaymentMethod {
  if (method === "upi") return "upi";
  if (method === "card") return "card";
  if (method === "netbanking") return "netbanking";
  return "other";
}

export interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  method: string;
  created_at: number;
  status: string;
}

/**
 * Idempotent by razorpayPaymentId — called from both the webhook handler
 * and the reconciliation job, so a redelivered webhook or a payment the
 * reconciliation job independently finds are both safe to call twice
 * (System Design §7's "non-negotiable" requirement for this one path).
 */
export async function recordPaymentFromRazorpay(entity: RazorpayPaymentEntity) {
  const existing = await prisma.payment.findUnique({ where: { razorpayPaymentId: entity.id } });
  if (existing) {
    return { alreadyRecorded: true as const };
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { razorpayOrderId: entity.order_id },
    include: { engagement: true },
  });

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        razorpayPaymentId: entity.id,
        amountMinor: BigInt(entity.amount),
        method: mapRazorpayMethod(entity.method),
        paidAt: new Date(entity.created_at * 1000),
      },
    }),
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: "paid" } }),
  ]);

  await cancelFollowUpTask("invoice", invoice.id);

  // Only the engagement's first-ever paid invoice advances the stage
  // (System Design §3.1 models one deposit_invoiced -> deposit_paid
  // transition, not one per milestone/final invoice).
  if (invoice.engagement.stage === "deposit_invoiced") {
    const ctx = new TenantContext(invoice.engagement.tenantId);
    await advanceStageAutomatically(ctx, invoice.engagementId, "deposit_invoiced");
    // PRD §8/§9: the welcome doc and intake form both draft themselves the
    // moment payment clears — no manual "now go write these" step.
    await autoCreateWelcomeDoc(ctx, invoice.engagementId);
    await autoCreateIntakeForm(ctx, invoice.engagementId);
  }

  return { alreadyRecorded: false as const, invoiceId: invoice.id };
}

/**
 * Safety net for a dropped webhook (PRD §7 edge case, System Design §7's
 * one non-negotiable path): polls every `sent` invoice with an order
 * against Razorpay's own records and records anything captured that we
 * don't already have.
 */
export async function reconcilePendingInvoices() {
  const pending = await prisma.invoice.findMany({
    where: { status: "sent", razorpayOrderId: { not: null } },
  });

  let checked = 0;
  let recorded = 0;
  for (const invoice of pending) {
    checked += 1;
    try {
      const response = await getRazorpayClient().orders.fetchPayments(invoice.razorpayOrderId!);
      for (const payment of response.items) {
        if (payment.status !== "captured") continue;
        const result = await recordPaymentFromRazorpay({
          id: payment.id,
          order_id: payment.order_id!,
          amount: Number(payment.amount),
          method: payment.method,
          created_at: payment.created_at,
          status: payment.status,
        });
        if (!result.alreadyRecorded) recorded += 1;
      }
    } catch (err) {
      console.error(`reconcilePendingInvoices: failed to check invoice ${invoice.id}`, err);
    }
  }

  return { checked, recorded };
}
