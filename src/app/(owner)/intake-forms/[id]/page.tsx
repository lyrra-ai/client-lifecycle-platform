import { getSession, requireTenantContext } from "@/lib/auth";
import { getIntakeFormForOwner } from "@/services/onboarding";
import { IntakeFormEditor } from "./intake-form-editor";

export default async function IntakeFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const form = await getIntakeFormForOwner(requireTenantContext(session), id);

  return <IntakeFormEditor initial={form} />;
}
