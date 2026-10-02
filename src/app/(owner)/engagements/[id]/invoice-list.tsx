"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface InvoiceRow {
  id: string;
  type: string;
  amount: number;
  currency: string;
  gstApplicable: boolean;
  status: string;
  dueDate: string | null;
}

export function InvoiceList({ engagementId, invoices }: { engagementId: string; invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("milestone");
  const [amountMajor, setAmountMajor] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${engagementId}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amountMajor, currency, gstApplicable }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't create invoice.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <h3>Invoices</h3>
      {invoices.length === 0 && <p>None yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Type</th>
            <th align="left">Amount</th>
            <th align="left">GST</th>
            <th align="left">Status</th>
            <th align="left"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.type}</td>
              <td>{inv.currency} {inv.amount.toFixed(2)}</td>
              <td>{inv.gstApplicable ? "yes" : "no"}</td>
              <td>{inv.status}</td>
              <td><a href={`/invoices/${inv.id}`}>Open</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {!open ? (
        <button onClick={() => setOpen(true)}>+ Add milestone/final invoice</button>
      ) : (
        <form onSubmit={addInvoice} style={{ border: "1px solid #ccc", padding: 12, marginTop: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="milestone">Milestone</option>
            <option value="final">Final</option>
          </select>
          <input
            type="number"
            placeholder="Amount"
            value={amountMajor}
            onChange={(e) => setAmountMajor(Number(e.target.value))}
          />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
          <label>
            <input type="checkbox" checked={gstApplicable} onChange={(e) => setGstApplicable(e.target.checked)} />
            GST applicable
          </label>
          <button type="submit" disabled={busy}>Create</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
