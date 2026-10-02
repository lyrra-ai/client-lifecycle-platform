import { getSession, requireTenantContext } from "@/lib/auth";
import { getWelcomeDocForOwner } from "@/services/onboarding";
import { WelcomeDocEditor } from "./welcome-doc-editor";

export default async function WelcomeDocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const doc = await getWelcomeDocForOwner(requireTenantContext(session), id);

  return <WelcomeDocEditor initial={doc} />;
}
