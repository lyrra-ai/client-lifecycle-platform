/**
 * Owner dashboard (PRD §15) — "what needs my attention today" without
 * opening any individual engagement. "Needs Follow-up" is surfaced first
 * (PRD §12), the single most important widget.
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { listFollowUpTasksForOwner } from "@/services/followup";
import { listEngagementsForDashboard, getRecentActivity } from "@/services/engagement";
import { getOutstandingInvoicesTotal } from "@/services/billing";
import { FollowupList } from "./followup-list";
import { EngagementList } from "./engagement-list";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const ctx = requireTenantContext(session);
  const [tasks, engagements, outstanding, activity] = await Promise.all([
    listFollowUpTasksForOwner(ctx),
    listEngagementsForDashboard(ctx),
    getOutstandingInvoicesTotal(ctx),
    getRecentActivity(ctx),
  ]);

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>

      <h2>Needs Follow-up</h2>
      <FollowupList tasks={tasks} />

      <h2>Outstanding</h2>
      {Object.keys(outstanding).length === 0 ? (
        <p>Nothing outstanding.</p>
      ) : (
        <ul>
          {Object.entries(outstanding).map(([currency, minor]) => (
            <li key={currency}>{currency} {(Number(minor) / 100).toFixed(2)} owed across unpaid invoices</li>
          ))}
        </ul>
      )}

      <h2>Engagements</h2>
      <EngagementList engagements={engagements} />

      <h2>Recent activity</h2>
      {activity.length === 0 ? (
        <p>Nothing yet.</p>
      ) : (
        <ul>
          {activity.map((item, i) => (
            <li key={i}>
              <a href={`/engagements/${item.engagementId}`}>{item.label}</a> — {new Date(item.at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
