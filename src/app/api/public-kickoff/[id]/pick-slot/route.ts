import { NextResponse } from "next/server";
import { z } from "zod";
import { pickKickoffSlot } from "@/services/kickoff";

const bodySchema = z.object({ slot: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A slot is required." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await pickKickoffSlot(id, parsed.data.slot);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
