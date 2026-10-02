import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { snoozeFollowUpTask } from "@/services/followup";

const bodySchema = z.object({ until: z.string(), reason: z.string().trim().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A date and reason are required." }, { status: 400 });
  }

  const { id } = await params;
  await snoozeFollowUpTask(requireTenantContext(session), id, parsed.data.until, parsed.data.reason);
  return NextResponse.json({ ok: true });
}
