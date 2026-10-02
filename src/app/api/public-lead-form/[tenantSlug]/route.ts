import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureLeadFromPublicForm } from "@/services/engagement/leads";

/**
 * Embeddable public web form (PRD §3) — one per tenant, shareable link,
 * no login required. Creates a Lead (status=new, source=web_form) directly.
 *
 * `tenantSlug` is the Tenant's id for v1 — no separate friendly-slug field
 * exists yet; that's a small, separate addition if a nicer public URL is
 * wanted later, not required for this feature to work end to end.
 */
const bodySchema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;

  try {
    const result = await captureLeadFromPublicForm(tenantSlug, {
      ...rest,
      email: email || undefined,
    });
    return NextResponse.json({ ok: true, leadId: result.lead.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "This form link is no longer valid." }, { status: 404 });
  }
}
