"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface EditorInvoice {
  id: string;
  type: string;
  amount: number;
  currency: string;
  gstApplicable: boolean;
  gstBreakup: Record<string, string | undefined> | null;
  status: string;
  dueDate: string | null;
}

export function InvoiceEditor({ initial }: { initial: EditorInvoice }) {
  const router = useRouter();
  const [amountMajor, setAmountMajor] = useState(initial.amount);
  const [gstApplicable, setGstApplicable] = useState(initial.gstApplicable);
  const [dueDate, setDueDate] = useState(initial.dueDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/invoices/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountMajor, gstApplicable, dueDate: dueDate || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't save.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  async function send() {
    setBusy(true);
    setMessage(null);
    await save();
    const res = await fetch(`/api/invoices/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed });
    router.refresh();
  }

  async function voidAndReissue() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/invoices/${initial.id}/void`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't void.");
      return;
    }
    setMessage("Voided. Create a new invoice from the engagement page to reissue.");
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 500, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Invoice ({initial.type}) — {initial.status}</h1>

      <label>
        Amount
        <input
          type="number"
          value={amountMajor}
          onChange={(e) => setAmountMajor(Number(e.target.value))}
          disabled={!isDraft}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
      </label>
      <p>Currency: {initial.currency}</p>

      <label>
        <input
          type="checkbox"
          checked={gstApplicable}
          onChange={(e) => setGstApplicable(e.target.checked)}
          disabled={!isDraft}
        />
        GST applicable
      </label>

      {initial.gstBreakup && (
        <ul>
          {Object.entries(initial.gstBreakup)
            .filter(([k]) => k !== "hsnSac")
            .map(([k, v]) => (
              <li key={k}>{k.toUpperCase()}: {v}</li>
            ))}
          <li>HSN/SAC: {initial.gstBreakup.hsnSac}</li>
        </ul>
      )}
      {gstApplicable && !initial.gstBreakup && (
        <p><em>GST breakup not computed — set the business state (Settings) and the client's state.</em></p>
      )}

      <label>
        Due date
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={!isDraft}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
      </label>

      {isDraft && (
        <div>
          <button onClick={save} disabled={busy}>Save draft</button>{" "}
          <button onClick={send} disabled={busy}>Send to client</button>
        </div>
      )}
      {initial.status === "sent" && (
        <button onClick={voidAndReissue} disabled={busy}>Void (correction requires a new invoice)</button>
      )}

      {message && <p>{message}</p>}
      {sentInfo && (
        <p>
          Sent. {sentInfo.emailed ? "Emailed to the client." : "Email not configured — share this link manually:"}{" "}
          <a href={sentInfo.publicUrl}>{sentInfo.publicUrl}</a>
        </p>
      )}
    </div>
  );
}
