import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { rescheduleKickoffCall } from "@/services/kickoff";

const bodySchema = z.object({ proposedSlots: z.array(z.string()).min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Propose at least one slot." }, { status: 400 });
  }

  const { id } = await params;
  const call = await rescheduleKickoffCall(requireTenantContext(session), id, parsed.data.proposedSlots);
  return NextResponse.json({ call });
}
