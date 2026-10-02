import { getSession, requireTenantContext } from "@/lib/auth";
import { getEngagement } from "@/services/engagement";
import { listInvoicesForOwner } from "@/services/billing";
import {
  getWelcomeDocForEngagement,
  getIntakeFormForEngagement,
  listAccessRequestsForEngagement,
  PLATFORM_LIBRARY,
} from "@/services/onboarding";
import { getKickoffCallForEngagement } from "@/services/kickoff";
import { OpenProposalButton } from "./open-proposal-button";
import { InvoiceList } from "./invoice-list";
import { AccessRequestList } from "./access-request-list";
import { ScheduleKickoff } from "./schedule-kickoff";

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const ctx = requireTenantContext(session);
  const engagement = await getEngagement(ctx, id);
  const invoices = await listInvoicesForOwner(ctx, id);
  const welcomeDoc = await getWelcomeDocForEngagement(ctx, id);
  const intakeForm = await getIntakeFormForEngagement(ctx, id);
  const accessRequests = await listAccessRequestsForEngagement(ctx, id);
  const kickoffCall = await getKickoffCallForEngagement(ctx, id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Engagement</h1>
      <p>id: {engagement.id}</p>
      <p>stage: {engagement.stage}</p>
      <p>currency: {engagement.currency}</p>
      <p>
        <a href={`/portal/${engagement.id}`}>Client portal link</a>
      </p>
      <OpenProposalButton engagementId={engagement.id} />
      <InvoiceList engagementId={engagement.id} invoices={invoices} />
      {welcomeDoc && (
        <p>
          <a href={`/welcome-docs/${welcomeDoc.id}`}>Welcome Doc ({welcomeDoc.status})</a>
        </p>
      )}
      {intakeForm && (
        <p>
          <a href={`/intake-forms/${intakeForm.id}`}>Intake Form ({intakeForm.status})</a>
        </p>
      )}
      <AccessRequestList
        engagementId={engagement.id}
        platformLibrary={PLATFORM_LIBRARY.map((p) => p.name)}
        requests={accessRequests}
      />
      <h3>Kickoff Call</h3>
      {kickoffCall ? (
        <p>
          <a href={`/kickoff-calls/${kickoffCall.id}`}>Kickoff Call ({kickoffCall.status})</a>
        </p>
      ) : (
        <ScheduleKickoff engagementId={engagement.id} />
      )}
    </main>
  );
}
