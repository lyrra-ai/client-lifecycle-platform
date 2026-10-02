import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { captureLead, listLeads } from "@/services/engagement/leads";

const createLeadSchema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  state: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leads = await listLeads(requireTenantContext(session));
  return NextResponse.json({ leads });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createLeadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;
  const result = await captureLead(requireTenantContext(session), {
    ...rest,
    email: email || undefined,
    source: "manual",
  });

  return NextResponse.json(result, { status: 201 });
}
