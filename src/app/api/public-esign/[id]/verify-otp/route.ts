import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEsignOtp } from "@/services/proposal/esign";

const bodySchema = z.object({
  signerName: z.string().trim().min(1),
  signerPhone: z.string().trim().min(5),
  code: z.string().trim().length(6),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Name, phone, and a 6-digit code are required." }, { status: 400 });
  }

  const { id } = await params;
  // x-forwarded-for may carry a comma-separated chain behind a proxy; the
  // first entry is the original client (System Design §4's recorded IP).
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { signerName, signerPhone, code } = parsed.data;
  const result = await verifyEsignOtp(id, signerName, signerPhone, code, ipAddress);

  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "Request a new code first.",
      expired: "That code has expired — request a new one.",
      too_many_attempts: "Too many incorrect attempts — please contact the agency.",
      incorrect: "That code is incorrect.",
      not_signable: "This proposal can't be signed right now.",
    };
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }

  return NextResponse.json({ ok: true, esignEvent: result.esignEvent });
}
