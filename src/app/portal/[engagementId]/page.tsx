/**
 * Client Portal (PRD §13) — one magic-link page per engagement, no login.
 * Pure read-aggregation via services/portal; never a separate source of
 * truth about Engagement.stage. Mobile-first, <2s load target
 * (System Design §7).
 *
 * The [engagementId] segment is Engagement.publicToken, an opaque token
 * distinct from the raw database id (same pattern as every other public
 * link in this app).
 */
import { getPortalData } from "@/services/portal";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  proposal_sent: "Proposal sent",
  proposal_accepted: "Proposal signed",
  deposit_invoiced: "Deposit invoiced",
  deposit_paid: "Deposit paid",
  onboarding: "Onboarding",
  kickoff_scheduled: "Kickoff scheduled",
  kickoff_done: "Kickoff done",
  in_delivery: "In delivery",
  feedback_requested: "Feedback requested",
  handed_over: "Handed over",
  closed: "Closed",
};

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  const data = await getPortalData(engagementId);
  const currentIndex = data.timeline.indexOf(data.currentStage);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{data.businessName}</h1>
          <p className="text-sm text-muted-foreground">Project status for {data.clientName}</p>
        </div>

        <ol className="flex flex-wrap gap-2">
          {data.timeline.map((stage, i) => (
            <li key={stage}>
              <Badge
                variant={i === currentIndex ? "default" : "secondary"}
                className={cn(i < currentIndex && "opacity-60")}
              >
                {STAGE_LABELS[stage] ?? stage}
              </Badge>
            </li>
          ))}
        </ol>

        {data.todo.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What we need from you</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {data.todo.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-sm text-accent-foreground hover:underline">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {data.proposal && (
                <li>
                  <a href={data.proposal.href} className="text-accent-foreground hover:underline">
                    Proposal (v{data.proposal.version}, {data.proposal.status})
                  </a>
                </li>
              )}
              {data.invoices.map((inv) => (
                <li key={inv.id}>
                  <a href={inv.href} className="text-accent-foreground hover:underline">
                    Invoice — {inv.currency} {inv.amount.toFixed(2)} ({inv.status})
                  </a>
                </li>
              ))}
              {data.welcomeDoc && (
                <li>
                  <a href={data.welcomeDoc.href} className="text-accent-foreground hover:underline">
                    Welcome document
                  </a>
                </li>
              )}
              {data.intakeForm && (
                <li>
                  <a href={data.intakeForm.href} className="text-accent-foreground hover:underline">
                    Intake form ({data.intakeForm.submitted ? "submitted" : "not yet submitted"})
                  </a>
                </li>
              )}
              {data.accessRequests && (
                <li>
                  <a href={data.accessRequests.href} className="text-accent-foreground hover:underline">
                    Access checklist ({data.accessRequests.granted}/{data.accessRequests.total} granted)
                  </a>
                </li>
              )}
              {data.kickoffCall && (
                <li>
                  <a href={data.kickoffCall.href} className="text-accent-foreground hover:underline">
                    Kickoff call ({data.kickoffCall.scheduledAt ? new Date(data.kickoffCall.scheduledAt).toLocaleString() : "pick a time"})
                    {data.kickoffCall.hasSummary ? " — summary available" : ""}
                  </a>
                </li>
              )}
            </ul>
            {!data.proposal && data.invoices.length === 0 && !data.welcomeDoc && !data.intakeForm && !data.accessRequests && !data.kickoffCall && (
              <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
