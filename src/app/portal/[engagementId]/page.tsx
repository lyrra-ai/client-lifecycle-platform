/**
 * Client Portal (PRD §13) — one magic-link page per engagement, no login.
 * Pure read-aggregation via services/portal; never a separate source of
 * truth about Engagement.stage. Mobile-first, <2s load target
 * (System Design §7).
 *
 * The [engagementId] segment is the magic-link token in v1 (a future
 * hardening pass would swap this for a signed/opaque token rather than
 * the raw database id — same category of deferral as every other public
 * link in this app so far).
 */
import { getPortalData } from "@/services/portal";

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
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{data.businessName}</h1>
      <p>Project status for {data.clientName}</p>

      <h2>Timeline</h2>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
        {data.timeline.map((stage, i) => (
          <li
            key={stage}
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              background: i === currentIndex ? "#111" : i < currentIndex ? "#ddd" : "#f5f5f5",
              color: i === currentIndex ? "#fff" : "#333",
              fontSize: 13,
            }}
          >
            {STAGE_LABELS[stage] ?? stage}
          </li>
        ))}
      </ol>

      {data.todo.length > 0 && (
        <section>
          <h2>What we need from you</h2>
          <ul>
            {data.todo.map((item) => (
              <li key={item.href}><a href={item.href}>{item.label}</a></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Documents</h2>
        <ul>
          {data.proposal && (
            <li><a href={data.proposal.href}>Proposal (v{data.proposal.version}, {data.proposal.status})</a></li>
          )}
          {data.invoices.map((inv) => (
            <li key={inv.id}>
              <a href={inv.href}>Invoice — {inv.currency} {inv.amount.toFixed(2)} ({inv.status})</a>
            </li>
          ))}
          {data.welcomeDoc && <li><a href={data.welcomeDoc.href}>Welcome document</a></li>}
          {data.intakeForm && (
            <li><a href={data.intakeForm.href}>Intake form ({data.intakeForm.submitted ? "submitted" : "not yet submitted"})</a></li>
          )}
          {data.accessRequests && (
            <li><a href={data.accessRequests.href}>Access checklist ({data.accessRequests.granted}/{data.accessRequests.total} granted)</a></li>
          )}
          {data.kickoffCall && (
            <li>
              <a href={data.kickoffCall.href}>
                Kickoff call ({data.kickoffCall.scheduledAt ? new Date(data.kickoffCall.scheduledAt).toLocaleString() : "pick a time"})
                {data.kickoffCall.hasSummary ? " — summary available" : ""}
              </a>
            </li>
          )}
        </ul>
        {!data.proposal && data.invoices.length === 0 && !data.welcomeDoc && !data.intakeForm && !data.accessRequests && !data.kickoffCall && (
          <p>Nothing shared yet.</p>
        )}
      </section>
    </main>
  );
}
