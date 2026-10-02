import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { setAccessRequestStatus } from "@/services/onboarding";

const bodySchema = z.object({ status: z.enum(["granted", "na"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { id } = await params;
  const request = await setAccessRequestStatus(requireTenantContext(session), id, parsed.data.status);
  return NextResponse.json({ request });
}
