import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { toggleActionItem } from "@/services/kickoff";

const bodySchema = z.object({ done: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id, index } = await params;
  try {
    const actionItems = await toggleActionItem(requireTenantContext(session), id, Number(index), parsed.data.done);
    return NextResponse.json({ actionItems });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
