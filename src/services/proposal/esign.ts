/**
 * E-sign (PRD §5) — OTP-based (phone + IP + timestamp), per System Design
 * §4. Lives in the Proposal Service's bounded context (owns EsignEvent,
 * System Design §2). No real PDF is generated here — EsignEvent.signedPdfUrl
 * stays null until a PDF library + S3 storage (System Design §7) exist;
 * the confirmation view is this iteration's "signed artifact."
 *
 * Public (no-login) functions, same pattern as the rest of this service's
 * public surface — a TenantContext is constructed from the proposal's
 * already-known tenantId, not from a session.
 */
import { prisma } from "@/lib/db";
import { TenantContext } from "@/lib/tenant";
import { createOtp, verifyOtp, resendCooldownRemaining } from "@/lib/otp";
import { sendSms } from "@/lib/integrations/sms";
import { advanceStageAutomatically } from "@/services/engagement";
import { autoCreateDepositInvoices } from "@/services/billing";
import { cancelFollowUpTask } from "@/services/followup";

export async function getEsignContext(proposalId: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { engagement: { include: { client: true } } },
  });

  return {
    proposalId: proposal.id,
    status: proposal.status,
    signable: proposal.status === "viewed",
    clientName: proposal.engagement.client.name,
    clientPhone: proposal.engagement.client.phone,
  };
}

export type RequestEsignOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_signable" }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number };

export async function requestEsignOtp(
  proposalId: string,
  signerPhone: string,
): Promise<RequestEsignOtpResult> {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  if (proposal.status !== "viewed") {
    return { ok: false, reason: "not_signable" };
  }

  const cooldown = await resendCooldownRemaining(signerPhone);
  if (cooldown > 0) {
    return { ok: false, reason: "cooldown", retryAfterSeconds: cooldown };
  }

  const code = await createOtp(signerPhone);
  try {
    await sendSms({ to: signerPhone, message: `Your verification code is ${code}.` });
  } catch (err) {
    // SMS provider isn't configured yet in local dev — same dev-fallback
    // pattern as login/email OTP (System Design §5's "never block").
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] e-sign OTP for ${signerPhone}: ${code}`);
    } else {
      throw err;
    }
  }

  return { ok: true };
}

export type VerifyEsignOtpResult =
  | { ok: true; esignEvent: { id: string; signedAt: Date } }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "incorrect" }
  | { ok: false; reason: "not_signable" };

/**
 * On success: creates the immutable EsignEvent, flips the Proposal to
 * `accepted`, and advances the Engagement off `proposal_sent` if it's
 * still there (PRD §5 -> System Design §3.1). E-sign allows only 3
 * incorrect attempts before requiring a fresh code (PRD §5), stricter
 * than login's 5.
 */
export async function verifyEsignOtp(
  proposalId: string,
  signerName: string,
  signerPhone: string,
  code: string,
  ipAddress: string | null,
): Promise<VerifyEsignOtpResult> {
  const otpResult = await verifyOtp(signerPhone, code, 3);
  if (!otpResult.ok) return otpResult;

  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { engagement: true },
  });
  if (proposal.status !== "viewed") {
    return { ok: false, reason: "not_signable" };
  }

  const esignEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.esignEvent.create({
      data: {
        proposalId,
        signerName,
        signerPhone,
        otpVerifiedAt: new Date(),
        ipAddress,
      },
    });
    await tx.proposal.update({ where: { id: proposalId }, data: { status: "accepted" } });
    return event;
  });

  // PRD §12: a signed proposal is resolved, not something to keep nudging.
  await cancelFollowUpTask("proposal", proposalId);

  if (proposal.engagement.stage === "proposal_sent") {
    await advanceStageAutomatically(
      new TenantContext(proposal.engagement.tenantId),
      proposal.engagementId,
      "proposal_sent",
    );
  }

  // PRD §6: the deposit invoice drafts itself the moment the proposal is
  // signed — no manual "now go create an invoice" step for the owner.
  await autoCreateDepositInvoices(new TenantContext(proposal.engagement.tenantId), proposal.engagementId);

  return { ok: true, esignEvent: { id: esignEvent.id, signedAt: esignEvent.otpVerifiedAt! } };
}
