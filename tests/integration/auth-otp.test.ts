import { describe, it, expect } from "vitest";
import { requestLoginOtp, verifyLoginOtp } from "@/lib/otp";
import { prisma } from "@/lib/db";

async function latestCodeFor(email: string): Promise<string> {
  const otp = await prisma.otpCode.findFirst({
    where: { identifier: email },
    orderBy: { createdAt: "desc" },
  });
  return otp!.code;
}

describe("requestLoginOtp / verifyLoginOtp", () => {
  it("verifies successfully with the correct code", async () => {
    await requestLoginOtp("owner@example.com");
    const code = await latestCodeFor("owner@example.com");

    const result = await verifyLoginOtp("owner@example.com", code);

    expect(result).toEqual({ ok: true });
  });

  it("rejects an incorrect code without consuming the real one", async () => {
    await requestLoginOtp("owner@example.com");
    const code = await latestCodeFor("owner@example.com");

    const wrong = await verifyLoginOtp("owner@example.com", "000000");
    expect(wrong).toEqual({ ok: false, reason: "incorrect" });

    const right = await verifyLoginOtp("owner@example.com", code);
    expect(right).toEqual({ ok: true });
  });

  it("rejects a code that has already been consumed (single-use)", async () => {
    await requestLoginOtp("owner@example.com");
    const code = await latestCodeFor("owner@example.com");
    await verifyLoginOtp("owner@example.com", code);

    const second = await verifyLoginOtp("owner@example.com", code);

    expect(second.ok).toBe(false);
  });

  it("rejects after 5 incorrect attempts even with the right code (brute-force cap)", async () => {
    await requestLoginOtp("owner@example.com");
    const code = await latestCodeFor("owner@example.com");

    for (let i = 0; i < 5; i++) {
      await verifyLoginOtp("owner@example.com", "000000");
    }

    const result = await verifyLoginOtp("owner@example.com", code);
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("normalizes email case/whitespace so a differently-cased retry still matches", async () => {
    await requestLoginOtp("  Owner@Example.com  ");
    const code = await latestCodeFor("owner@example.com");

    const result = await verifyLoginOtp("OWNER@example.com", code);

    expect(result).toEqual({ ok: true });
  });
});
