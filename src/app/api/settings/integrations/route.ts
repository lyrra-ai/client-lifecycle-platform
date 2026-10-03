import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { getIntegrationStatus } from "@/services/settings";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getIntegrationStatus(requireTenantContext(session));
  return NextResponse.json({ status });
}
