import { NextResponse } from "next/server";
import { z } from "zod";
import { submitIntakeResponse } from "@/services/onboarding";

const bodySchema = z.object({ answers: z.record(z.string()) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await submitIntakeResponse(id, parsed.data.answers);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
