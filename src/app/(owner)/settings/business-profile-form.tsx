"use client";

/**
 * Business profile (PRD §15 slice) — GST number, state, default deposit %.
 * The minimum billing (PRD §6) needs to compute GST and pre-fill deposit
 * invoices; the rest of Settings (team, Razorpay/WhatsApp, templates) is
 * a separate, later iteration.
 */
import { useState } from "react";

export interface SettingsData {
  businessName: string;
  gstNumber: string | null;
  state: string | null;
  defaultDepositPercent: number;
  defaultCurrency: string;
}

export function BusinessProfileForm({ initial }: { initial: SettingsData }) {
  const [gstNumber, setGstNumber] = useState(initial.gstNumber ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const [defaultDepositPercent, setDefaultDepositPercent] = useState(initial.defaultDepositPercent);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstNumber, state, defaultDepositPercent }),
    });
    setBusy(false);
    setMessage(res.ok ? "Saved." : "Couldn't save.");
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 400 }}>
      <p>{initial.businessName} &middot; {initial.defaultCurrency}</p>

      <label>
        GST number (leave blank if not registered)
        <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 8 }} />
      </label>

      <label>
        Business state (needed to compute CGST/SGST vs IGST)
        <input value={state} onChange={(e) => setState(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 8 }} />
      </label>

      <label>
        Default deposit percentage
        <input
          type="number"
          min={1}
          max={100}
          value={defaultDepositPercent}
          onChange={(e) => setDefaultDepositPercent(Number(e.target.value))}
          style={{ display: "block", width: "100%", marginBottom: 8 }}
        />
      </label>

      <button type="submit" disabled={busy}>Save</button>
      {message && <span style={{ marginLeft: 8 }}>{message}</span>}
    </form>
  );
}
