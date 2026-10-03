/**
 * Cross-cutting tenant settings (PRD §15). Business profile, follow-up
 * cadence, notification channel preference, team members, and read-only
 * integration status are implemented; a full per-tenant Razorpay/WhatsApp
 * credential entry UI is NOT — both providers are still wired from a single
 * set of env vars (System Design's v1 is dogfood-only, one real tenant),
 * so there's nothing per-tenant to store yet. That's explicitly deferred in
 * PROGRESS.md until there are outside tenants (PRD §15's "entered once" by
 * each tenant implies multi-tenant credentials, which isn't built).
 * Configurable templates/question-library seeds (PRD §15) are also not
 * built — no "service type" concept exists anywhere in the schema yet, so
 * "seeds per service type" needs a product decision before building it.
 */
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import type { NotificationChannel } from "@prisma/client";

export function getTenantSettings(ctx: TenantContext) {
  return withTenant(ctx, (tenantId) =>
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        businessName: true,
        gstNumber: true,
        state: true,
        defaultDepositPercent: true,
        defaultCurrency: true,
        notificationChannel: true,
      },
    }),
  );
}

export function updateTenantSettings(
  ctx: TenantContext,
  input: {
    gstNumber?: string | null;
    state?: string | null;
    defaultDepositPercent?: number;
    notificationChannel?: NotificationChannel;
  },
) {
  return withTenant(ctx, (tenantId) =>
    prisma.tenant.update({
      where: { id: tenantId },
      data: input,
      select: {
        businessName: true,
        gstNumber: true,
        state: true,
        defaultDepositPercent: true,
        defaultCurrency: true,
        notificationChannel: true,
      },
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Integration status (PRD §15 "Razorpay/WhatsApp connection") — read-only
// for now, see module docstring for why there's no credential entry form.
// ─────────────────────────────────────────────────────────────────────────

export function getIntegrationStatus(ctx: TenantContext) {
  return withTenant(ctx, async () => ({
    razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    whatsappConfigured: Boolean(process.env.WHATSAPP_PROVIDER_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID),
    emailConfigured: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Team members (PRD §15) — v1 scope per the PRD: name/role/email only, no
// invite-link flow needed since login is email+OTP (src/lib/otp.ts) and any
// email with a pre-created User row under this tenant can just log in.
// ─────────────────────────────────────────────────────────────────────────

export function listTeamMembers(ctx: TenantContext) {
  return withTenant(ctx, (tenantId) =>
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  );
}

/**
 * Login resolves a user by email alone, not (tenantId, email) — see
 * src/app/api/auth/verify-otp/route.ts — so an email already registered
 * under a different tenant can't be safely added here too; that would make
 * login's `findFirst({ where: { email } })` ambiguous about which tenant to
 * log the person into. Refuse rather than create that collision.
 */
export async function inviteTeamMember(ctx: TenantContext, input: { name: string; email: string }) {
  return withTenant(ctx, async (tenantId) => {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) throw new Error("Name is required.");

    const existingAnywhere = await prisma.user.findFirst({ where: { email } });
    if (existingAnywhere) {
      throw new Error(
        existingAnywhere.tenantId === tenantId
          ? "This person is already a team member."
          : "This email is already registered under a different account.",
      );
    }

    return prisma.user.create({
      data: { tenantId, name, email, role: "team_member" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  });
}

/**
 * Revokes the member's active sessions and removes them. Refuses to remove
 * yourself (avoid locking yourself out by mistake) or the last remaining
 * owner (every tenant needs at least one).
 */
export async function removeTeamMember(ctx: TenantContext, userId: string, currentUserId: string) {
  return withTenant(ctx, async (tenantId) => {
    const target = await prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });

    if (target.id === currentUserId) {
      throw new Error("You can't remove yourself.");
    }
    if (target.role === "owner") {
      const otherOwners = await prisma.user.count({ where: { tenantId, role: "owner", NOT: { id: userId } } });
      if (otherOwners === 0) {
        throw new Error("Can't remove the only owner on this account.");
      }
    }

    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  });
}
