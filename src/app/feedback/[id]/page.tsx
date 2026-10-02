/**
 * Public, no-login feedback view (PRD §14).
 */
import { getPublicFeedbackRequest } from "@/services/feedback";
import { FeedbackForm } from "./feedback-form";

export default async function PublicFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getPublicFeedbackRequest(id);

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{request.businessName}</h1>
      <p>How did we do, {request.clientName}?</p>

      {request.alreadySubmitted ? (
        <p>You've already shared your feedback. Thank you!</p>
      ) : (
        <FeedbackForm requestId={request.id} />
      )}
    </main>
  );
}
