/**
 * Engagement list — all active engagements with current stage,
 * sortable/filterable (PRD §15).
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { listEngagementsForDashboard } from "@/services/engagement";
import { EngagementList } from "../dashboard/engagement-list";

export default async function EngagementsPage() {
  const session = await getSession();
  if (!session) return null;

  const engagements = await listEngagementsForDashboard(requireTenantContext(session));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-3xl">Engagements</h1>
      <EngagementList engagements={engagements} />
    </div>
  );
}
