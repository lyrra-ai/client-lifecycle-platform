import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { listTeamMembers, inviteTeamMember } from "@/services/settings";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await listTeamMembers(requireTenantContext(session));
  return NextResponse.json({ members });
}

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can add team members." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A name and valid email are required." }, { status: 400 });
  }

  try {
    const member = await inviteTeamMember(requireTenantContext(session), parsed.data);
    return NextResponse.json({ member });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
