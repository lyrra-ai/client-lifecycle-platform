"use client";

/**
 * Razorpay hosted Checkout (PRD §7) — we never build our own card-entry
 * form (System Design §4, PCI scope stays with Razorpay). Success here is
 * a UX nicety only; the webhook is the only path that marks the invoice
 * paid, so this polls the invoice's own status rather than trusting the
 * checkout callback directly.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function Checkout({ invoiceId, amountMinor, currency }: { invoiceId: string; amountMinor: string; currency: string }) {
  const [status, setStatus] = useState<"idle" | "opening" | "processing" | "paid" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function pay() {
    setStatus("opening");
    setError(null);
    const res = await fetch(`/api/public-payments/${invoiceId}/create-order`, { method: "POST" });
    const order = await res.json();
    if (!res.ok) {
      setStatus("error");
      setError(order.error ?? "Couldn't start payment.");
      return;
    }

    const razorpay = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: Number(amountMinor),
      currency,
      name: "Invoice payment",
      handler: () => {
        setStatus("processing");
        pollForConfirmation();
      },
      modal: {
        ondismiss: () => setStatus("idle"),
      },
    });
    razorpay.open();
  }

  function pollForConfirmation() {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/public-payments/${invoiceId}/status`);
      const data = await res.json();
      if (data.status === "paid") {
        clearInterval(interval);
        setStatus("paid");
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 60_000);
  }

  if (status === "paid") {
    return (
      <p className="text-sm text-success">
        <strong>Payment confirmed. Thank you!</strong>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={pay} disabled={status === "opening" || status === "processing"} className="self-start">
        Pay {currency} {(Number(amountMinor) / 100).toFixed(2)}
      </Button>
      {status === "processing" && <p className="text-sm text-muted-foreground">Payment received — confirming…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
