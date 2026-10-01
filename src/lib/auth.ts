/**
 * Auth — Email + OTP login for v1 (System Design §4), the same OTP
 * mechanism reused for e-sign (one mechanism, not two). Session carries
 * tenant_id and role; every request resolves to a TenantContext (see
 * src/lib/tenant.ts) before any service function runs.
 */
import { TenantContext } from "./tenant";

export type SessionRole = "owner" | "team_member";

export interface Session {
  userId: string;
  tenantId: string;
  role: SessionRole;
}

/**
 * Resolve the current request's session into a Session (tenantId + role).
 * Scaffold placeholder — wire to real cookie/JWT session storage during
 * auth implementation.
 */
export async function getSession(): Promise<Session | null> {
  throw new Error("getSession() not yet implemented.");
}

export function requireTenantContext(session: Session): TenantContext {
  return new TenantContext(session.tenantId);
}
