import { getSession, requireTenantContext } from "@/lib/auth";
import { getProposalForOwner } from "@/services/proposal";
import { ProposalEditor } from "./proposal-editor";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const proposal = await getProposalForOwner(requireTenantContext(session), id);

  return <ProposalEditor initial={proposal} />;
}
