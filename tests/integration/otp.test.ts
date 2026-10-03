import { describe, it, expect } from "vitest";
import { createOtp, verifyOtp, resendCooldownRemaining } from "@/lib/otp";
import { prisma } from "@/lib/db";

describe("createOtp / verifyOtp (generic, identifier-based)", () => {
  it("verifies with the stored code, works for any identifier shape (email or phone)", async () => {
    const code = await createOtp("+919876543210");

    const result = await verifyOtp("+919876543210", code);

    expect(result).toEqual({ ok: true });
  });

  it("respects a caller-supplied max-attempts cap stricter than the default", async () => {
    const code = await createOtp("+919876543210");

    for (let i = 0; i < 3; i++) {
      await verifyOtp("+919876543210", "000000", 3);
    }

    const result = await verifyOtp("+919876543210", code, 3);
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("consume=false checks validity without spending the code, so a real verify right after still succeeds (signup flow's new-user probe step)", async () => {
    const code = await createOtp("+919876543210");

    const probe = await verifyOtp("+919876543210", code, 5, false);
    expect(probe).toEqual({ ok: true });

    const real = await verifyOtp("+919876543210", code);
    expect(real).toEqual({ ok: true });

    const reused = await verifyOtp("+919876543210", code);
    expect(reused.ok).toBe(false);
  });

  it("consume=false still increments attempts on a wrong code (brute-force protection applies either way)", async () => {
    await createOtp("+919876543210");

    const probe = await verifyOtp("+919876543210", "000000", 5, false);
    expect(probe).toEqual({ ok: false, reason: "incorrect" });

    const otp = await prisma.otpCode.findFirstOrThrow({ where: { identifier: "+919876543210" } });
    expect(otp.attempts).toBe(1);
  });

  it("rejects an expired code", async () => {
    const code = await createOtp("+919876543210");
    await prisma.otpCode.updateMany({
      where: { identifier: "+919876543210" },
      data: { expiresAt: new Date("2000-01-01") },
    });

    const result = await verifyOtp("+919876543210", code);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });
});

describe("resendCooldownRemaining", () => {
  it("is 0 when no OTP has been requested yet", async () => {
    expect(await resendCooldownRemaining("+919876543210")).toBe(0);
  });

  it("is >0 immediately after requesting an OTP (PRD §5: resend cooldown)", async () => {
    await createOtp("+919876543210");

    const remaining = await resendCooldownRemaining("+919876543210");

    expect(remaining).toBeGreaterThan(0);
    // Allow a couple of seconds of slack for clock skew between the test
    // process and Postgres's own now() used for createdAt.
    expect(remaining).toBeLessThanOrEqual(32);
  });

  it("is 0 again once the cooldown window has passed", async () => {
    await createOtp("+919876543210");
    await prisma.otpCode.updateMany({
      where: { identifier: "+919876543210" },
      data: { createdAt: new Date(Date.now() - 31_000) },
    });

    expect(await resendCooldownRemaining("+919876543210")).toBe(0);
  });
});
