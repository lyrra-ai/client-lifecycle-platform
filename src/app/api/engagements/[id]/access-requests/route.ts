import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { createAccessRequests } from "@/services/onboarding";

const bodySchema = z.object({ platforms: z.array(z.string().trim().min(1)).min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Select at least one platform." }, { status: 400 });
  }

  const { id } = await params;
  const requests = await createAccessRequests(requireTenantContext(session), id, parsed.data.platforms);
  return NextResponse.json({ requests }, { status: 201 });
}
