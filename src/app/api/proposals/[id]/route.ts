import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { updateDraftProposal } from "@/services/proposal";

const bodySchema = z.object({
  coverNote: z.string().optional(),
  validUntil: z.string().nullable().optional(),
  lineItems: z.array(
    z.object({
      description: z.string().trim().min(1),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      currency: z.string().trim().min(1),
    }),
  ),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal data." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const proposal = await updateDraftProposal(requireTenantContext(session), id, parsed.data);
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
