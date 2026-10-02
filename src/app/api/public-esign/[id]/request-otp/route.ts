import { NextResponse } from "next/server";
import { z } from "zod";
import { requestEsignOtp } from "@/services/proposal/esign";

const bodySchema = z.object({ signerPhone: z.string().trim().min(5) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A phone number is required." }, { status: 400 });
  }

  const { id } = await params;
  const result = await requestEsignOtp(id, parsed.data.signerPhone);

  if (!result.ok) {
    if (result.reason === "cooldown") {
      return NextResponse.json(
        { error: `Please wait ${result.retryAfterSeconds}s before requesting another code.` },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "This proposal can't be signed right now." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
