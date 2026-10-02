/**
 * Lead Capture (PRD §3) — deliberately lightweight, not a CRM pipeline.
 * Lives in the Engagement Service's bounded context (System Design §2)
 * because `Lead` and `Client` are owned there alongside `Engagement`.
 *
 * `Lead` itself carries no contact info — name/company/email/phone live on
 * `Client` (System Design §3's data model). So capturing a lead is really
 * "find or create the Client, then create a Lead pointing at it," which is
 * also how dedup works: a matching Client means we link the new Lead to it
 * instead of creating a second contact (PRD §3 edge case — warn, don't block).
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import type { LeadSource, LeadStatus } from "@prisma/client";

export interface CaptureLeadInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  state?: string; // compared against Tenant.state for GST (System Design §4, PRD §6)
  notes?: string;
  source: LeadSource;
}

export interface CaptureLeadResult {
  lead: { id: string; status: LeadStatus; source: LeadSource; notes: string | null; createdAt: Date };
  client: { id: string; name: string; company: string | null; email: string | null; phone: string | null };
  matchedExistingClient: boolean;
}

async function findOrCreateClient(
  tenantId: string,
  input: Pick<CaptureLeadInput, "name" | "company" | "email" | "phone" | "state">,
) {
  const email = input.email?.trim().toLowerCase() || undefined;
  const phone = input.phone?.trim() || undefined;

  if (email || phone) {
    const existing = await prisma.client.findFirst({
      where: {
        tenantId,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });
    if (existing) {
      return { ...existing, matched: true };
    }
  }

  const created = await prisma.client.create({
    data: {
      tenantId,
      name: input.name,
      company: input.company,
      email,
      phone,
      state: input.state,
    },
  });
  return { ...created, matched: false };
}

export async function captureLead(
  ctx: TenantContext,
  input: CaptureLeadInput,
): Promise<CaptureLeadResult> {
  return withTenant(ctx, async (tenantId) => {
    const client = await findOrCreateClient(tenantId, input);

    const lead = await prisma.lead.create({
      data: {
        tenantId,
        clientId: client.id,
        source: input.source,
        notes: input.notes,
      },
    });

    return {
      lead: { id: lead.id, status: lead.status, source: lead.source, notes: lead.notes, createdAt: lead.createdAt },
      client: { id: client.id, name: client.name, company: client.company, email: client.email, phone: client.phone },
      matchedExistingClient: client.matched,
    };
  });
}

/**
 * Public, no-login capture path for the embeddable web form (PRD §3).
 * Takes a raw tenantId (resolved from the public URL, not a session) —
 * this is the one legitimate place a TenantContext is built without an
 * authenticated session, the same pattern used by magic-link proposal/
 * portal views elsewhere in the product.
 */
export async function captureLeadFromPublicForm(
  tenantId: string,
  input: Omit<CaptureLeadInput, "source">,
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error("Unknown tenant.");
  }
  return captureLead(new TenantContext(tenantId), { ...input, source: "web_form" });
}

export function listLeads(ctx: TenantContext) {
  return withTenant(ctx, (tenantId) =>
    prisma.lead.findMany({
      where: { tenantId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function markLeadLost(ctx: TenantContext, leadId: string) {
  return withTenant(ctx, (tenantId) =>
    prisma.lead.update({
      where: { id: leadId, tenantId },
      data: { status: "lost" },
    }),
  );
}

/**
 * "Create Proposal" action (PRD §3 acceptance criteria): carries the
 * lead's contact info into a new Engagement with zero re-typing, by
 * reusing the Lead's clientId directly.
 */
export async function createEngagementFromLead(ctx: TenantContext, leadId: string) {
  return withTenant(ctx, async (tenantId) => {
    const lead = await prisma.lead.findFirstOrThrow({
      where: { id: leadId, tenantId },
      include: { client: true },
    });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    return prisma.engagement.create({
      data: {
        tenantId,
        clientId: lead.clientId!,
        leadId: lead.id,
        currency: lead.client?.preferredCurrency ?? tenant.defaultCurrency,
      },
    });
  });
}
