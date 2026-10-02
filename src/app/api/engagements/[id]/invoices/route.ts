import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { createManualInvoice } from "@/services/billing";

const bodySchema = z.object({
  type: z.enum(["deposit", "milestone", "final"]),
  amountMajor: z.number().positive(),
  currency: z.string().trim().min(1),
  gstApplicable: z.boolean(),
  dueDate: z.string().nullable().optional(),
});

/** Manual milestone/final invoice (PRD §6: splitting one proposal into multiple invoices). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice data." }, { status: 400 });
  }

  const { id } = await params;
  const invoice = await createManualInvoice(requireTenantContext(session), id, parsed.data);
  return NextResponse.json({ invoice }, { status: 201 });
}
