import { NextResponse } from "next/server";
import { z } from "zod";
import { submitFeedbackResponse } from "@/services/feedback";

const bodySchema = z.object({ rating: z.number().int().min(1).max(5), comments: z.string().trim().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A rating from 1-5 is required." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await submitFeedbackResponse(id, parsed.data.rating, parsed.data.comments);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
