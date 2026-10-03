import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginOtp } from "@/lib/otp";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  // Only required the first time this email logs in — bootstraps the
  // founder's own Tenant (PRD §1 "dogfooded on real client engagements
  // before being sold"). An existing tenant/user never needs this again.
  businessName: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and a 6-digit code are required." }, { status: 400 });
  }

  const { email, code, businessName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  let user = await prisma.user.findFirst({ where: { email: normalizedEmail } });

  // Only spend the code once we know this verification won't need a second
  // round trip: an existing user logs in immediately, and a new user with a
  // business name already in hand is also done after this check. A new user
  // with no business name yet is just a probe ("does this email need one?")
  // — consuming the code here would make the real submission that follows
  // (same code, now with businessName filled in) fail as already-used.
  const consume = Boolean(user) || Boolean(businessName);
  const result = await verifyLoginOtp(normalizedEmail, code, consume);
  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      not_found: "Request a new code first.",
      expired: "That code has expired — request a new one.",
      too_many_attempts: "Too many incorrect attempts — request a new code.",
      incorrect: "That code is incorrect.",
    };
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }

  if (!user) {
    if (!businessName) {
      // First time this email has logged in and no business name was given —
      // tell the client to collect it and retry rather than guessing a name
      // (System Design never hard-codes a placeholder business name, PRD §17).
      return NextResponse.json({ needsBusinessName: true }, { status: 200 });
    }

    const tenant = await prisma.tenant.create({
      data: { businessName },
    });
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: normalizedEmail, name: normalizedEmail, role: "owner" },
    });
  }

  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
