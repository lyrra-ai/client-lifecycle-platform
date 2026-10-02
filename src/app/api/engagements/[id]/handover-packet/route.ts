import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { createHandoverPacket } from "@/services/feedback";

const bodySchema = z.object({
  deliverables: z.array(z.object({ fileName: z.string().trim().min(1), url: z.string().trim().min(1) })),
  ownerNotes: z.string().trim().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deliverables." }, { status: 400 });
  }

  const { id } = await params;
  const packet = await createHandoverPacket(requireTenantContext(session), id, parsed.data);
  return NextResponse.json({ packet }, { status: 201 });
}
