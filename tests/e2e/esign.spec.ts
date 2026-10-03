import { test, expect } from "@playwright/test";
import { seedViewedProposal, cleanupTenant } from "./seed";
import { prisma } from "../../src/lib/db";

/**
 * Drives the real e-sign UI (src/app/esign/[id]/esign-flow.tsx) through an
 * actual browser — genuine multi-step client-side JS (details -> OTP ->
 * signed) the Vitest integration suite can't reach since it only calls
 * service functions directly, never renders a React component (README's
 * Testing section: e2e is for flows the other layers can't exercise).
 *
 * No SMS provider is configured in local dev (OTP_SMS_PROVIDER_API_KEY is
 * unset) — src/services/proposal/esign.ts falls back to storing the code
 * in otp_codes and logging it, same dev-mode pattern as login. Rather than
 * scrape server stdout (which this test process doesn't have a handle on —
 * the dev server runs in a separate terminal per README), read the code
 * straight from the dev DB the running server itself uses.
 */

let tenantId: string;
const signerPhone = `9${Date.now().toString().slice(-9)}`; // unique per run, avoids OTP resend-cooldown collisions across runs

test.afterEach(async () => {
  if (tenantId) await cleanupTenant(tenantId);
  await prisma.otpCode.deleteMany({ where: { identifier: signerPhone } });
});

test("signer completes details -> OTP -> signed, and the proposal/engagement/invoice update for real", async ({ page }) => {
  const seeded = await seedViewedProposal(500);
  tenantId = seeded.tenantId;

  await page.goto(`/esign/${seeded.proposalPublicToken}`);
  await expect(page.getByRole("heading", { name: "Sign & Accept" })).toBeVisible();

  await page.getByPlaceholder("Your name").fill("Playwright Signer");
  await page.getByPlaceholder("Your phone number").fill(signerPhone);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByText(`Enter the 6-digit code sent to ${signerPhone}.`)).toBeVisible();

  let otp: string | null = null;
  await expect
    .poll(
      async () => {
        const row = await prisma.otpCode.findFirst({
          where: { identifier: signerPhone, consumedAt: null },
          orderBy: { createdAt: "desc" },
        });
        otp = row?.code ?? null;
        return otp;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();

  await page.locator('input[inputmode="numeric"]').fill(otp!);
  await page.getByRole("button", { name: "Verify & sign" }).click();

  await expect(page.getByRole("heading", { name: "Signed" })).toBeVisible();
  await expect(page.getByText(`Signed by Playwright Signer (${signerPhone})`)).toBeVisible();

  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: seeded.proposalId } });
  expect(proposal.status).toBe("accepted");

  const esignEvent = await prisma.esignEvent.findFirstOrThrow({ where: { proposalId: seeded.proposalId } });
  expect(esignEvent.signerPhone).toBe(signerPhone);
  expect(esignEvent.otpVerifiedAt).not.toBeNull();

  // PRD §6: the deposit invoice drafts itself the moment the proposal is signed.
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { engagementId: seeded.engagementId, type: "deposit" } });
  expect(invoice.status).toBe("draft");
  expect(invoice.amountMinor).toBe(25000n); // 50% default deposit of the seeded ₹500 line item
});

test("an incorrect code is rejected without signing the proposal", async ({ page }) => {
  const seeded = await seedViewedProposal(500);
  tenantId = seeded.tenantId;
  const wrongAttemptPhone = `8${Date.now().toString().slice(-9)}`;

  await page.goto(`/esign/${seeded.proposalPublicToken}`);
  await page.getByPlaceholder("Your name").fill("Playwright Signer");
  await page.getByPlaceholder("Your phone number").fill(wrongAttemptPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(`Enter the 6-digit code sent to ${wrongAttemptPhone}.`)).toBeVisible();

  await page.locator('input[inputmode="numeric"]').fill("000000");
  await page.getByRole("button", { name: "Verify & sign" }).click();

  await expect(page.getByText("That code is incorrect.")).toBeVisible();

  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: seeded.proposalId } });
  expect(proposal.status).toBe("viewed");

  await prisma.otpCode.deleteMany({ where: { identifier: wrongAttemptPhone } });
});
