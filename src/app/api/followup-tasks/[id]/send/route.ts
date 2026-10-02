import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { reviewAndSendFollowUp } from "@/services/followup";

const bodySchema = z.object({ message: z.string().trim().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await reviewAndSendFollowUp(requireTenantContext(session), id, parsed.data.message);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
