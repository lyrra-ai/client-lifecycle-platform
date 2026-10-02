import { getSession, requireTenantContext } from "@/lib/auth";
import { getHandoverPacketForOwner } from "@/services/feedback";
import { HandoverEditor } from "./handover-editor";

export default async function HandoverPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const packet = await getHandoverPacketForOwner(requireTenantContext(session), id);

  return <HandoverEditor initial={packet} />;
}
