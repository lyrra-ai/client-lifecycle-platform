import { NextResponse } from "next/server";
import { z } from "zod";
import { clientMarkAccessRequestGranted } from "@/services/onboarding";

const bodySchema = z.object({ note: z.string().trim().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const request = await clientMarkAccessRequestGranted(id, parsed.data.note);
    return NextResponse.json({ request });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
