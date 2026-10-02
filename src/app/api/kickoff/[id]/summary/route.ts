import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { generateCallSummary } from "@/services/kickoff";

const bodySchema = z.object({ notes: z.string().trim().optional(), recordingUrl: z.string().trim().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id } = await params;
  const summary = await generateCallSummary(requireTenantContext(session), id, parsed.data);
  return NextResponse.json({ summary });
}
