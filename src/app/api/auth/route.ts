import { NextResponse } from "next/server";

/**
 * Email + OTP auth (System Design §4). Scaffold placeholder — split into
 * request-otp / verify-otp routes when implementing; session must carry
 * tenant_id and role per src/lib/auth.ts.
 */
export async function POST() {
  return NextResponse.json({ error: "auth not yet implemented" }, { status: 501 });
}
