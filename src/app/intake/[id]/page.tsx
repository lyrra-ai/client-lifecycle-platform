/**
 * Public, no-login intake form view (PRD §9).
 */
import { getPublicIntakeForm } from "@/services/onboarding";
import { IntakeFormView } from "./intake-form-view";

export default async function PublicIntakeFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getPublicIntakeForm(id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{form.businessName}</h1>
      <p>A few questions to get started, {form.clientName}.</p>

      {form.alreadySubmitted ? (
        <p>You've already submitted this form. Thank you!</p>
      ) : (
        <IntakeFormView formId={form.id} questions={form.questions} />
      )}
    </main>
  );
}
