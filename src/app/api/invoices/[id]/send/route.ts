import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { sendInvoice } from "@/services/billing";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await sendInvoice(requireTenantContext(session), id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
