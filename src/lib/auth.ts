/**
 * Auth — Email + OTP login for v1 (System Design §4), the same OTP
 * mechanism reused for e-sign (one mechanism, not two). Session carries
 * tenant_id and role; every request resolves to a TenantContext (see
 * src/lib/tenant.ts) before any service function runs.
 *
 * Session storage: an opaque random token in the `Session` table, held by
 * the caller in an httpOnly cookie. Boring and DB-backed (System Design
 * §1.8) rather than a JWT library this pre-revenue scaffold doesn't need yet.
 */
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "./db";
import { TenantContext } from "./tenant";

export type SessionRole = "owner" | "team_member";

export interface Session {
  userId: string;
  tenantId: string;
  role: SessionRole;
}

export const SESSION_COOKIE_NAME = "clp_session";
const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { token, userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Resolve the current request's session into a Session (tenantId + role).
 * Returns null if there is no session or it has expired — callers decide
 * whether that means "redirect to /login" (pages) or a 401 (API routes).
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
  };
}

export function requireTenantContext(session: Session): TenantContext {
  return new TenantContext(session.tenantId);
}
