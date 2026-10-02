/**
 * Public, no-login invoice view (PRD §6). "Pay Now" hands off to Payment
 * Collection (PRD §7, next iteration's stub) — Razorpay isn't wired yet.
 */
import { getPublicInvoice } from "@/services/billing";

export default async function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id);

  const payable = invoice.status === "sent";

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{invoice.businessName}</h1>
      <p>Invoice for {invoice.clientName}</p>
      <h2>{invoice.currency} {invoice.amount.toFixed(2)}</h2>
      <p>Type: {invoice.type}</p>

      {invoice.gstApplicable && invoice.gstBreakup && (
        <ul>
          {Object.entries(invoice.gstBreakup)
            .filter(([k]) => k !== "hsnSac")
            .map(([k, v]) => (
              <li key={k}>{k.toUpperCase()}: {invoice.currency} {(Number(v) / 100).toFixed(2)}</li>
            ))}
        </ul>
      )}

      {invoice.dueDate && <p>Due {new Date(invoice.dueDate).toLocaleDateString()}</p>}

      {payable ? (
        <a href={`/pay/${invoice.id}`}><button>Pay Now</button></a>
      ) : (
        <p><em>Status: {invoice.status}</em></p>
      )}
    </main>
  );
}
