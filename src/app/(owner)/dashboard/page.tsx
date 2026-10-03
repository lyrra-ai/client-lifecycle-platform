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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-3xl">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Needs follow-up</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowupList tasks={tasks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(outstanding).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {Object.entries(outstanding).map(([currency, minor]) => (
                <li key={currency} className="font-mono text-sm">
                  {currency} {(Number(minor) / 100).toFixed(2)} owed across unpaid invoices
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engagements</CardTitle>
        </CardHeader>
        <CardContent>
          <EngagementList engagements={engagements} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activity.map((item, i) => (
                <li key={i} className="text-sm">
                  <a href={`/engagements/${item.engagementId}`} className="text-accent-foreground hover:underline">
                    {item.label}
                  </a>{" "}
                  <span className="text-muted-foreground">— {new Date(item.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
