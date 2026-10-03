import { describe, it, expect } from "vitest";
import { createTenant } from "../helpers/factories";
import { prisma } from "@/lib/db";
import {
  getTenantSettings,
  updateTenantSettings,
  getIntegrationStatus,
  listTeamMembers,
  inviteTeamMember,
  removeTeamMember,
} from "@/services/settings";

describe("getTenantSettings / updateTenantSettings", () => {
  it("defaults notificationChannel to email_first", async () => {
    const { ctx } = await createTenant();

    const settings = await getTenantSettings(ctx);

    expect(settings.notificationChannel).toBe("email_first");
  });

  it("updates notificationChannel to whatsapp_first", async () => {
    const { ctx } = await createTenant();

    const updated = await updateTenantSettings(ctx, { notificationChannel: "whatsapp_first" });

    expect(updated.notificationChannel).toBe("whatsapp_first");
  });
});

describe("getIntegrationStatus", () => {
  it("reports configured based on env vars present at test time", async () => {
    const { ctx } = await createTenant();

    const status = await getIntegrationStatus(ctx);

    expect(status).toEqual({
      razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      whatsappConfigured: Boolean(process.env.WHATSAPP_PROVIDER_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID),
      emailConfigured: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
    });
  });
});

async function createOwner(tenantId: string, email = "owner@tenant.test") {
  return prisma.user.create({ data: { tenantId, name: "Owner", email, role: "owner" } });
}

describe("listTeamMembers / inviteTeamMember / removeTeamMember", () => {
  it("lists the owner created at tenant setup", async () => {
    const { ctx, tenant } = await createTenant();
    const owner = await createOwner(tenant.id);

    const members = await listTeamMembers(ctx);

    expect(members).toHaveLength(1);
    expect(members[0]!.id).toBe(owner.id);
    expect(members[0]!.role).toBe("owner");
  });

  it("invites a new team_member under the same tenant", async () => {
    const { ctx } = await createTenant();

    const member = await inviteTeamMember(ctx, { name: "Priya", email: "Priya@Example.com" });

    expect(member.role).toBe("team_member");
    expect(member.email).toBe("priya@example.com"); // normalized lowercase
    const members = await listTeamMembers(ctx);
    expect(members).toHaveLength(1);
  });

  it("refuses to invite an email already on this tenant", async () => {
    const { ctx } = await createTenant();
    await inviteTeamMember(ctx, { name: "Priya", email: "priya@example.com" });

    await expect(inviteTeamMember(ctx, { name: "Priya 2", email: "priya@example.com" })).rejects.toThrow(/already a team member/i);
  });

  it("refuses to invite an email already registered under a different tenant", async () => {
    const { ctx: ctxA } = await createTenant("Tenant A");
    const { ctx: ctxB } = await createTenant("Tenant B");
    await inviteTeamMember(ctxA, { name: "Priya", email: "priya@example.com" });

    await expect(inviteTeamMember(ctxB, { name: "Priya", email: "priya@example.com" })).rejects.toThrow(/different account/i);
  });

  it("removes a team member and their sessions", async () => {
    const { ctx, tenant } = await createTenant();
    const owner = await createOwner(tenant.id);
    const member = await inviteTeamMember(ctx, { name: "Priya", email: "priya@example.com" });
    await prisma.session.create({
      data: { token: "tok1", userId: member.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await removeTeamMember(ctx, member.id, owner.id);

    const members = await listTeamMembers(ctx);
    expect(members).toHaveLength(1);
    const sessions = await prisma.session.findMany({ where: { userId: member.id } });
    expect(sessions).toHaveLength(0);
  });

  it("refuses to remove yourself", async () => {
    const { ctx, tenant } = await createTenant();
    const owner = await createOwner(tenant.id);

    await expect(removeTeamMember(ctx, owner.id, owner.id)).rejects.toThrow(/can't remove yourself/i);
  });

  it("refuses to remove the only owner", async () => {
    const { ctx, tenant } = await createTenant();
    const owner = await createOwner(tenant.id);
    const member = await inviteTeamMember(ctx, { name: "Priya", email: "priya@example.com" });

    await expect(removeTeamMember(ctx, owner.id, member.id)).rejects.toThrow(/only owner/i);
  });

  it("allows removing an owner when another owner remains", async () => {
    const { ctx, tenant } = await createTenant();
    const owner1 = await createOwner(tenant.id, "owner1@tenant.test");
    const owner2 = await createOwner(tenant.id, "owner2@tenant.test");

    await removeTeamMember(ctx, owner2.id, owner1.id);

    const members = await listTeamMembers(ctx);
    expect(members).toHaveLength(1);
  });
});
