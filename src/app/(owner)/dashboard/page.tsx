/**
 * Owner dashboard (PRD §15) — "Needs Follow-up" is the single most
 * important widget, surfaced first (PRD §12). Engagement list / outstanding
 * invoices total / activity feed are later additions to this page.
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { listFollowUpTasksForOwner } from "@/services/followup";
import { FollowupList } from "./followup-list";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const tasks = await listFollowUpTasksForOwner(requireTenantContext(session));

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      <h2>Needs Follow-up</h2>
      <FollowupList tasks={tasks} />
    </main>
  );
}
