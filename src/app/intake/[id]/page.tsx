/**
 * Public, no-login intake form view (PRD §9).
 */
import { getPublicIntakeForm } from "@/services/onboarding";
import { IntakeFormView } from "./intake-form-view";
import { PublicShell } from "@/components/public-shell";

export default async function PublicIntakeFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getPublicIntakeForm(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{form.businessName}</h1>
          <p className="text-sm text-muted-foreground">A few questions to get started, {form.clientName}.</p>
        </div>

        {form.alreadySubmitted ? (
          <p className="text-sm text-success">You&apos;ve already submitted this form. Thank you!</p>
        ) : (
          <IntakeFormView formId={form.id} questions={form.questions} />
        )}
      </div>
    </PublicShell>
  );
}
