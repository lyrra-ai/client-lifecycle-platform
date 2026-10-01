/**
 * Tenant isolation guard (System Design §4).
 *
 * Every query MUST go through withTenant() — this is a code-review rule and
 * a lint check, not just a convention, because one missed filter is a
 * cross-tenant data leak. Postgres Row-Level Security is the second line of
 * defense (planned once there are real paying tenants beyond the founder's
 * own business) — this wrapper is the first and is required regardless.
 */

export class TenantContext {
  constructor(public readonly tenantId: string) {
    if (!tenantId) {
      throw new Error("withTenant() called without a tenantId — refusing to run an unscoped query.");
    }
  }
}

/**
 * Wrap a data-access function so it always receives an explicit, non-empty
 * tenant scope. Service-layer functions should accept a TenantContext as
 * their first argument and use it to filter every query
 * (e.g. `where: { tenantId: ctx.tenantId, ... }`), never trusting a bare
 * id from the caller.
 *
 * Example:
 *   export function listEngagements(ctx: TenantContext) {
 *     return withTenant(ctx, (tenantId) =>
 *       prisma.engagement.findMany({ where: { tenantId } })
 *     );
 *   }
 */
export function withTenant<T>(
  ctx: TenantContext,
  fn: (tenantId: string) => Promise<T>,
): Promise<T> {
  return fn(ctx.tenantId);
}
