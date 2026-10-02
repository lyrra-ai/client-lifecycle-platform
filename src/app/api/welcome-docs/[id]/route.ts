import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateDraftWelcomeDoc } from "@/services/onboarding";

const bodySchema = z.object({ content: z.string().trim().min(1) });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const doc = await updateDraftWelcomeDoc(requireTenantContext(session), id, parsed.data.content);
    return NextResponse.json({ doc });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
