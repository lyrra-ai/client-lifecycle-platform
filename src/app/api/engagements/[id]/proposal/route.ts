import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { getOrCreateDraftProposal } from "@/services/proposal";

/**
 * Opens (or starts) the draft proposal for this engagement — the hand-off
 * target from the "Create Proposal" action on a Lead (PRD §3 -> §4).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const proposal = await getOrCreateDraftProposal(requireTenantContext(session), id);
  // Return only the id — the editor page fetches the full (BigInt-safe
  // serialized) proposal itself via getProposalForOwner.
  return NextResponse.json({ proposalId: proposal.id });
}
