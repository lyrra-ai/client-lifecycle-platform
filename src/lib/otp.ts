/**
 * OTP issuance/verification — the one mechanism shared by login (email)
 * and e-sign (phone), per System Design §4 ("one mechanism reused, not
 * two"). `identifier` is whichever one the caller is verifying against;
 * this module has no opinion on which channel it travels over.
 */
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/integrations/email";

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 30;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * How many seconds until `identifier` is allowed another OTP, or 0 if it
 * can request one now (PRD §5 edge case: a short cooldown to prevent
 * resend abuse).
 */
export async function resendCooldownRemaining(identifier: string): Promise<number> {
  const latest = await prisma.otpCode.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return 0;

  const elapsedMs = Date.now() - latest.createdAt.getTime();
  const remainingMs = RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Generates and stores a new OTP for `identifier`. Does not send it —
 * callers are responsible for delivery (email vs. SMS) and for their own
 * dev-fallback logging, since that differs per channel.
 */
export async function createOtp(identifier: string): Promise<string> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await prisma.otpCode.create({ data: { identifier, code, expiresAt } });
  return code;
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "incorrect" };

/**
 * @param maxAttempts login allows 5 incorrect tries before requiring a new
 * code; e-sign is stricter at 3 (PRD §5) before falling back to "contact
 * the agency" messaging.
 */
/**
 * @param consume Pass false to check the code without spending it — used by
 * the login route's "is this a known user" probe step (System Design §4's
 * email+OTP signup flow), where a second real verification follows
 * immediately after collecting the business name. Consuming it on the
 * probe would make that second step fail with "not_found" even though the
 * code was correct (the bug this parameter fixes — see PROGRESS.md
 * iteration 21). Attempt-counting (brute-force protection) still applies
 * regardless of this flag.
 */
export async function verifyOtp(
  identifier: string,
  code: string,
  maxAttempts = 5,
  consume = true,
): Promise<VerifyOtpResult> {
  const otp = await prisma.otpCode.findFirst({
    where: { identifier, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, reason: "not_found" };
  if (otp.attempts >= maxAttempts) return { ok: false, reason: "too_many_attempts" };
  if (otp.expiresAt < new Date()) return { ok: false, reason: "expired" };

  if (otp.code !== code.trim()) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "incorrect" };
  }

  if (consume) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Login (email channel) — thin wrappers over the generic functions above.
// ─────────────────────────────────────────────────────────────────────────

export async function requestLoginOtp(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = await createOtp(normalizedEmail);

  try {
    await sendEmail({
      tenantId: "system", // pre-auth: no tenant context exists yet for a login OTP
      to: normalizedEmail,
      subject: "Your login code",
      html: `<p>Your code is <strong>${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>`,
    });
  } catch (err) {
    // Email provider isn't configured yet in local dev (System Design §5's
    // "never block on a provider outage" principle, applied to dev setup
    // rather than an outage) — surface the code in server logs so the login
    // flow is still testable end to end before EMAIL_PROVIDER_API_KEY exists.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] login OTP for ${normalizedEmail}: ${code}`);
    } else {
      throw err;
    }
  }
}

export async function verifyLoginOtp(email: string, code: string, consume = true): Promise<VerifyOtpResult> {
  return verifyOtp(email.trim().toLowerCase(), code, 5, consume);
}
