/**
 * Payment Collection (PRD §7) — no login required, reached from the
 * public invoice view's "Pay Now" link.
 */
import { getPublicInvoice } from "@/services/billing";
import { Checkout } from "./checkout";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id);

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>Pay {invoice.businessName}</h1>
      <p>{invoice.currency} {invoice.amount.toFixed(2)} — {invoice.type}</p>

      {invoice.status === "paid" ? (
        <p><strong>This invoice has already been paid.</strong></p>
      ) : invoice.status === "sent" ? (
        <Checkout invoiceId={invoice.id} amountMinor={invoice.amountMinor} currency={invoice.currency} />
      ) : (
        <p><em>This invoice can't be paid right now (status: {invoice.status}).</em></p>
      )}
    </main>
  );
}
