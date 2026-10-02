import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateIntakeForm } from "@/services/onboarding";

const bodySchema = z.object({
  questions: z.array(z.object({ id: z.string(), label: z.string().trim().min(1), required: z.boolean() })),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid questions." }, { status: 400 });
  }

  const { id } = await params;
  const form = await updateIntakeForm(requireTenantContext(session), id, parsed.data.questions);
  return NextResponse.json({ form });
}
