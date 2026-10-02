import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { markNoShow } from "@/services/kickoff";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const call = await markNoShow(requireTenantContext(session), id);
  return NextResponse.json({ call });
}
