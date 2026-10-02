import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { getFollowUpRules, updateFollowUpRule } from "@/services/followup";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await getFollowUpRules(requireTenantContext(session));
  return NextResponse.json({ rules });
}

const bodySchema = z.object({
  targetType: z.enum(["proposal", "invoice", "intake_form", "access_request"]),
  nudgeDaysAfter: z.array(z.number().int().positive()).min(1),
  maxNudges: z.number().int().positive(),
});

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rule." }, { status: 400 });
  }

  const { targetType, ...rest } = parsed.data;
  await updateFollowUpRule(requireTenantContext(session), targetType, rest);
  return NextResponse.json({ ok: true });
}
