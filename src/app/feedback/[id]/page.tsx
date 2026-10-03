/**
 * Public, no-login feedback view (PRD §14).
 */
import { getPublicFeedbackRequest } from "@/services/feedback";
import { FeedbackForm } from "./feedback-form";
import { PublicShell } from "@/components/public-shell";

export default async function PublicFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getPublicFeedbackRequest(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{request.businessName}</h1>
          <p className="text-sm text-muted-foreground">How did we do, {request.clientName}?</p>
        </div>

        {request.alreadySubmitted ? (
          <p className="text-sm text-success">You&apos;ve already shared your feedback. Thank you!</p>
        ) : (
          <FeedbackForm requestId={request.id} />
        )}
      </div>
    </PublicShell>
  );
}
