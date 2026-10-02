import { getSession, requireTenantContext } from "@/lib/auth";
import { getKickoffCallForOwner } from "@/services/kickoff";
import { KickoffEditor } from "./kickoff-editor";

export default async function KickoffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const call = await getKickoffCallForOwner(requireTenantContext(session), id);

  return <KickoffEditor initial={call} />;
}
