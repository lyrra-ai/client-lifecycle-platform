import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateDraftInvoice } from "@/services/billing";

const bodySchema = z.object({
  amountMajor: z.number().positive().optional(),
  gstApplicable: z.boolean().optional(),
  dueDate: z.string().nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice data." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const invoice = await updateDraftInvoice(requireTenantContext(session), id, parsed.data);
    return NextResponse.json({ invoice });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
