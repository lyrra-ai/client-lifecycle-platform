import { test, expect } from "@playwright/test";
import { seedSentInvoiceWithRealOrder, cleanupTenant } from "./seed";
import { prisma } from "../../src/lib/db";
import { reconcilePendingInvoices } from "../../src/services/billing";

/**
 * Drives Razorpay's real hosted Checkout (test mode) through an actual
 * browser — not a mock — to prove the UI-level integration works, not just
 * the server-side pieces (which the Vitest integration suite already
 * covers with a mocked Razorpay client).
 *
 * Razorpay-specific quirks learned while building this (documented here so
 * the next person doesn't have to rediscover them):
 *   - The hosted checkout renders inside an iframe from api.razorpay.com —
 *     every locator must go through page.frameLocator(...).
 *   - "4111 1111 1111 1111" (the textbook Visa test number) is flagged
 *     "international" and rejected by this account; Razorpay's documented
 *     *domestic* test card is the Mastercard below.
 *   - A well-known placeholder mobile number like 9876543210 is rejected
 *     client-side; any plausible 10-digit Indian number works.
 *   - A "save this card" dialog can appear after both the card-submit step
 *     and the OTP-submit step — each must be dismissed before continuing.
 *   - The bank's test OTP page needs Razorpay's documented test OTP: 1221.
 *
 * The browser's own "payment succeeded" event is NOT how we confirm
 * payment (System Design §7: only the webhook/reconciliation path may mark
 * an invoice paid) — so this test, like our own /pay/[id] page, waits for
 * the invoice to actually flip to "paid" via the real backend path rather
 * than trusting anything the client observed.
 */

const TEST_CARD_NUMBER = "5267318187975449"; // Razorpay's documented domestic Mastercard test number
const TEST_MOBILE = "7418529631";
const TEST_OTP = "1221";

let tenantId: string;

test.afterEach(async () => {
  if (tenantId) await cleanupTenant(tenantId);
});

test("real Razorpay Checkout completes and the invoice is confirmed paid via reconciliation", async ({ page }) => {
  const seeded = await seedSentInvoiceWithRealOrder(50);
  tenantId = seeded.tenantId;

  await page.goto(`/pay/${seeded.invoiceId}`);
  await page.getByRole("button", { name: /Pay/ }).click();

  const rzp = page.frameLocator('iframe[src*="api.razorpay.com"]');

  const mobileInput = rzp.getByPlaceholder("Mobile number");
  await mobileInput.click();
  await mobileInput.pressSequentially(TEST_MOBILE, { delay: 40 });

  const cardInput = rzp.getByPlaceholder("Card Number");
  await cardInput.click();
  await cardInput.pressSequentially(TEST_CARD_NUMBER, { delay: 20 });
  await rzp.getByPlaceholder("MM / YY").click();
  await rzp.getByPlaceholder("MM / YY").pressSequentially("1235", { delay: 20 });
  await rzp.getByPlaceholder("CVV").click();
  await rzp.getByPlaceholder("CVV").pressSequentially("123", { delay: 20 });

  await rzp.getByRole("button", { name: "Continue" }).click({ force: true });

  const saveCardDialog1 = rzp.getByRole("button", { name: "Maybe later" });
  if (await saveCardDialog1.isVisible({ timeout: 8000 }).catch(() => false)) {
    await saveCardDialog1.click();
  }

  const otpInput = rzp.getByPlaceholder("Enter OTP");
  await otpInput.waitFor({ state: "visible", timeout: 15000 });
  await otpInput.click();
  await otpInput.pressSequentially(TEST_OTP, { delay: 60 });
  await rzp.getByRole("button", { name: "Continue" }).last().click({ force: true });

  // The real captured payment is now sitting on Razorpay's side with no
  // webhook able to reach this dev server — reconciliation is what's
  // supposed to catch exactly this (PRD §7's dropped-webhook safety net).
  await expect
    .poll(
      async () => {
        const result = await reconcilePendingInvoices();
        const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: seeded.invoiceId } });
        return result.recorded > 0 || invoice.status === "paid" ? invoice.status : "sent";
      },
      { timeout: 60_000, intervals: [3000] },
    )
    .toBe("paid");

  const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: seeded.invoiceId } });
  expect(payment.method).toBe("card");
  expect(Number(payment.amountMinor)).toBe(2500); // 50% default deposit of the seeded ₹50 line item

  const engagement = await prisma.engagement.findUniqueOrThrow({ where: { id: seeded.engagementId } });
  expect(engagement.stage).toBe("deposit_paid");
});
