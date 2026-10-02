import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { generateAIDraft, getProposalForOwner } from "@/services/proposal";

const bodySchema = z.object({ brief: z.string().trim().min(1) });

/**
 * "Generate with AI" (PRD §4) — returns a draft the owner can edit before
 * saving; never persisted here (System Design §1 principle 3).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A brief is required." }, { status: 400 });
  }

  const { id } = await params;
  const ctx = requireTenantContext(session);
  const proposal = await getProposalForOwner(ctx, id);
  const draft = await generateAIDraft(ctx, proposal.engagementId, parsed.data.brief);

  return NextResponse.json({ draft });
}
