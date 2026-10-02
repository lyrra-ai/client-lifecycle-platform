import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateAgenda } from "@/services/kickoff";

const bodySchema = z.object({
  sections: z.array(z.object({
    title: z.string().trim().min(1),
    durationMinutes: z.number().positive(),
    talkingPoints: z.array(z.string()),
  })),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agenda." }, { status: 400 });
  }

  const { id } = await params;
  const call = await updateAgenda(requireTenantContext(session), id, parsed.data.sections);
  return NextResponse.json({ call });
}
