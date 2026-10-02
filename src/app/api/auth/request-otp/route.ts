import { NextResponse } from "next/server";
import { z } from "zod";
import { requestLoginOtp } from "@/lib/otp";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  await requestLoginOtp(parsed.data.email);

  return NextResponse.json({ ok: true });
}
