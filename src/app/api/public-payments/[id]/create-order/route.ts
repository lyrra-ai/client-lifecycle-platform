import { NextResponse } from "next/server";
import { createRazorpayOrderForInvoice } from "@/services/billing";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await createRazorpayOrderForInvoice(id);
    return NextResponse.json(order);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
