import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { markFollowUpResolvedManually } from "@/services/followup";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await markFollowUpResolvedManually(requireTenantContext(session), id);
  return NextResponse.json({ ok: true });
}
