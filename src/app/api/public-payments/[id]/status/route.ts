import { NextResponse } from "next/server";
import { getPublicPaymentStatus } from "@/services/billing";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await getPublicPaymentStatus(id);
  return NextResponse.json(status);
}
