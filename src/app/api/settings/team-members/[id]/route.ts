import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { removeTeamMember } from "@/services/settings";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can remove team members." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await removeTeamMember(requireTenantContext(session), id, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
