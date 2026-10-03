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
import { listFeedbackRequestsForEngagement, getHandoverPacketForEngagement } from "@/services/feedback";
import { OpenProposalButton } from "./open-proposal-button";
import { InvoiceList } from "./invoice-list";
import { AccessRequestList } from "./access-request-list";
import { ScheduleKickoff } from "./schedule-kickoff";
import { FeedbackHandover } from "./feedback-handover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const feedbackRequests = await listFeedbackRequestsForEngagement(ctx, id);
  const handoverPacket = await getHandoverPacketForEngagement(ctx, id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl">Engagement</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{engagement.stage.replace(/_/g, " ")}</Badge>
            <span className="font-mono">{engagement.currency}</span>
          </div>
        </div>
        <a href={`/portal/${engagement.publicToken}`} className="text-sm text-accent-foreground hover:underline">
          Client portal link
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proposal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <OpenProposalButton engagementId={engagement.id} />
          {welcomeDoc && (
            <a href={`/welcome-docs/${welcomeDoc.id}`} className="text-sm text-accent-foreground hover:underline">
              Welcome Doc ({welcomeDoc.status})
            </a>
          )}
          {intakeForm && (
            <a href={`/intake-forms/${intakeForm.id}`} className="text-sm text-accent-foreground hover:underline">
              Intake Form ({intakeForm.status})
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceList engagementId={engagement.id} invoices={invoices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <AccessRequestList
            engagementId={engagement.id}
            engagementPublicToken={engagement.publicToken}
            platformLibrary={PLATFORM_LIBRARY.map((p) => p.name)}
            requests={accessRequests}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kickoff Call</CardTitle>
        </CardHeader>
        <CardContent>
          {kickoffCall ? (
            <a href={`/kickoff-calls/${kickoffCall.id}`} className="text-sm text-accent-foreground hover:underline">
              Kickoff Call ({kickoffCall.status})
            </a>
          ) : (
            <ScheduleKickoff engagementId={engagement.id} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback & Handover</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackHandover
            engagementId={engagement.id}
            feedbackRequests={feedbackRequests}
            handoverPacketId={handoverPacket?.id ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
