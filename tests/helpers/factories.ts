import { prisma } from "@/lib/db";
import { TenantContext } from "@/lib/tenant";
import type { EngagementStage } from "@prisma/client";
import { generatePublicToken } from "@/lib/public-token";

export async function createTenant(
  businessName = "Test Tenant",
  overrides: Partial<{ gstNumber: string; state: string; defaultDepositPercent: number }> = {},
) {
  const tenant = await prisma.tenant.create({ data: { businessName, ...overrides } });
  return { tenant, ctx: new TenantContext(tenant.id) };
}

export async function createClient(
  tenantId: string,
  overrides: Partial<{ name: string; email: string; phone: string; state: string }> = {},
) {
  return prisma.client.create({
    data: {
      tenantId,
      name: overrides.name ?? "Test Client",
      email: overrides.email,
      phone: overrides.phone,
      state: overrides.state,
    },
  });
}

export async function createEngagement(
  tenantId: string,
  clientId: string,
  stage: EngagementStage = "lead",
) {
  return prisma.engagement.create({
    data: { tenantId, clientId, stage, publicToken: generatePublicToken() },
  });
}

/** Convenience: tenant + client + engagement in one call for tests that don't care about the setup details. */
export async function createTenantWithEngagement(stage: EngagementStage = "lead") {
  const { tenant, ctx } = await createTenant();
  const client = await createClient(tenant.id);
  const engagement = await createEngagement(tenant.id, client.id, stage);
  return { tenant, ctx, client, engagement };
}
