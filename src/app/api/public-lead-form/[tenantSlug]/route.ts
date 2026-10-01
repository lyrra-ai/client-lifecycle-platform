import { NextRequest, NextResponse } from "next/server";

/**
 * Embeddable public web form (PRD §3) — one per tenant, shareable link,
 * no login required. Creates a Lead with status=new, source=web-form
 * directly.
 *
 * Scaffold placeholder.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  void req;
  return NextResponse.json(
    { error: `public lead form not yet implemented for tenant "${tenantSlug}"` },
    { status: 501 },
  );
}
