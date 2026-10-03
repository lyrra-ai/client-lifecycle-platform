import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireTenantContext } from "@/lib/auth";
import { getTenantSettings, updateTenantSettings } from "@/services/settings";

const bodySchema = z.object({
  gstNumber: z.string().trim().optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
  defaultDepositPercent: z.number().int().min(1).max(100).optional(),
  notificationChannel: z.enum(["whatsapp_first", "email_first"]).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getTenantSettings(requireTenantContext(session));
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  }

  const { gstNumber, state, defaultDepositPercent, notificationChannel } = parsed.data;
  const settings = await updateTenantSettings(requireTenantContext(session), {
    gstNumber: gstNumber || null,
    state: state || null,
    defaultDepositPercent,
    notificationChannel,
  });
  return NextResponse.json({ settings });
}
