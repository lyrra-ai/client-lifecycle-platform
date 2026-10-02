import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { createEngagementFromLead } from "@/services/engagement/leads";

/**
 * "Create Proposal" action (PRD §3) — creates the Engagement from this Lead
 * and hands back its id so the UI can navigate to it. The actual Proposal
 * Builder is a later iteration; the engagement detail page is a stub until
 * then.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const engagement = await createEngagementFromLead(requireTenantContext(session), id);
  return NextResponse.json({ engagement }, { status: 201 });
}
