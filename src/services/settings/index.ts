/**
 * Cross-cutting tenant settings (PRD §15). Minimal slice for now: just the
 * business-profile fields billing (PRD §6) needs to compute GST — the rest
 * of §15 (team members, Razorpay/WhatsApp connection, templates) is a
 * separate, later concern.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";

export function getTenantSettings(ctx: TenantContext) {
  return withTenant(ctx, (tenantId) =>
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { businessName: true, gstNumber: true, state: true, defaultDepositPercent: true, defaultCurrency: true },
    }),
  );
}

export function updateTenantSettings(
  ctx: TenantContext,
  input: { gstNumber?: string | null; state?: string | null; defaultDepositPercent?: number },
) {
  return withTenant(ctx, (tenantId) =>
    prisma.tenant.update({
      where: { id: tenantId },
      data: input,
      select: { businessName: true, gstNumber: true, state: true, defaultDepositPercent: true, defaultCurrency: true },
    }),
  );
}
