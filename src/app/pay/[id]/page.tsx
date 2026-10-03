/**
 * Payment Collection (PRD §7) — no login required, reached from the
 * public invoice view's "Pay Now" link.
 */
import { getPublicInvoice } from "@/services/billing";
import { Checkout } from "./checkout";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent } from "@/components/ui/card";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl">Pay {invoice.businessName}</h1>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="font-mono text-2xl">
              {invoice.currency} {invoice.amount.toFixed(2)} <span className="text-sm text-muted-foreground">— {invoice.type}</span>
            </p>

            {invoice.status === "paid" ? (
              <p className="text-sm text-success">
                <strong>This invoice has already been paid.</strong>
              </p>
            ) : invoice.status === "sent" ? (
              <Checkout invoiceId={invoice.id} amountMinor={invoice.amountMinor} currency={invoice.currency} />
            ) : (
              <p className="text-sm text-muted-foreground">
                <em>This invoice can&apos;t be paid right now (status: {invoice.status}).</em>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
