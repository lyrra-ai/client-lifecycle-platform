import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateHandoverPacket } from "@/services/feedback";

const bodySchema = z.object({
  deliverables: z.array(z.object({ fileName: z.string().trim().min(1), storageKey: z.string().trim().min(1) })),
  summary: z.string().trim().min(1),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid packet data." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const packet = await updateHandoverPacket(requireTenantContext(session), id, parsed.data);
    return NextResponse.json({ packet });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
