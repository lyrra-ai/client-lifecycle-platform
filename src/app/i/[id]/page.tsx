/**
 * Public, no-login invoice view (PRD §6). "Pay Now" hands off to Payment
 * Collection (PRD §7, next iteration's stub) — Razorpay isn't wired yet.
 */
import { getPublicInvoice } from "@/services/billing";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id);

  const payable = invoice.status === "sent";

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{invoice.businessName}</h1>
          <p className="text-sm text-muted-foreground">Invoice for {invoice.clientName}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="font-mono text-3xl">
              {invoice.currency} {invoice.amount.toFixed(2)}
            </p>
            <Badge variant="secondary" className="w-fit capitalize">
              {invoice.type}
            </Badge>

            {invoice.gstApplicable && invoice.gstBreakup && (
              <ul className="flex flex-col gap-1 font-mono text-sm text-muted-foreground">
                {Object.entries(invoice.gstBreakup)
                  .filter(([k]) => k !== "hsnSac")
                  .map(([k, v]) => (
                    <li key={k}>
                      {k.toUpperCase()}: {invoice.currency} {(Number(v) / 100).toFixed(2)}
                    </li>
                  ))}
              </ul>
            )}

            {invoice.dueDate && (
              <p className="text-sm text-muted-foreground">Due {new Date(invoice.dueDate).toLocaleDateString()}</p>
            )}
          </CardContent>
        </Card>

        {payable ? (
          <Button asChild>
            <a href={`/pay/${invoice.id}`}>Pay Now</a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            <em>Status: {invoice.status}</em>
          </p>
        )}
      </div>
    </PublicShell>
  );
}
