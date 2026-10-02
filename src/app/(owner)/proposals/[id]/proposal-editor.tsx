"use client";

/**
 * Proposal editor (PRD §4) — line-item table (add/remove/reorder rows),
 * a cover-note area (AI-draftable, always editable before sending),
 * currency per line item, auto-calculated totals per currency.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface EditorLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  currency: string;
}

export interface EditorInitialData {
  id: string;
  status: string;
  coverNote: string | null;
  validUntil: string | null;
  client: { name: string; email: string | null };
  lineItems: EditorLineItem[];
  totals: Record<string, string>;
}

function formatMinor(totalMinor: string, currency: string): string {
  return `${currency} ${(Number(totalMinor) / 100).toFixed(2)}`;
}

export function ProposalEditor({ initial }: { initial: EditorInitialData }) {
  const router = useRouter();
  const [coverNote, setCoverNote] = useState(initial.coverNote ?? "");
  const [validUntil, setValidUntil] = useState(initial.validUntil?.slice(0, 10) ?? "");
  const [lineItems, setLineItems] = useState<EditorLineItem[]>(
    initial.lineItems.length ? initial.lineItems : [{ description: "", qty: 1, unitPrice: 0, currency: "INR" }],
  );
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  function updateItem(i: number, patch: Partial<EditorLineItem>) {
    setLineItems((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setLineItems((items) => [...items, { description: "", qty: 1, unitPrice: 0, currency: "INR" }]);
  }

  function removeItem(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

  async function generateWithAI() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/proposals/${initial.id}/ai-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't generate a draft.");
      return;
    }
    setCoverNote(data.draft.coverNote);
    if (data.draft.lineItems.length > 0) setLineItems(data.draft.lineItems);
    setMessage("AI draft inserted — review and edit before saving.");
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/proposals/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverNote, validUntil: validUntil || null, lineItems }),
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
    const res = await fetch(`/api/proposals/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed });
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Proposal (v{initial.status === "draft" ? "draft" : initial.status})</h1>
      <p>Client: {initial.client.name} {initial.client.email ? `<${initial.client.email}>` : ""}</p>

      {isDraft && (
        <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 16 }}>
          <input
            placeholder="Short brief, e.g. '3-page website redesign, $1,500, 3-week timeline'"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            style={{ width: "70%" }}
          />
          <button onClick={generateWithAI} disabled={busy || !brief.trim()}>
            Generate with AI
          </button>
        </div>
      )}

      <h3>Cover note</h3>
      <textarea
        value={coverNote}
        onChange={(e) => setCoverNote(e.target.value)}
        disabled={!isDraft}
        rows={4}
        style={{ width: "100%" }}
      />

      <h3>Line items</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Description</th>
            <th align="left">Qty</th>
            <th align="left">Unit price</th>
            <th align="left">Currency</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, i) => (
            <tr key={i}>
              <td>
                <input
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  disabled={!isDraft}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                  disabled={!isDraft}
                  style={{ width: 60 }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                  disabled={!isDraft}
                  style={{ width: 100 }}
                />
              </td>
              <td>
                <select
                  value={item.currency}
                  onChange={(e) => updateItem(i, { currency: e.target.value })}
                  disabled={!isDraft}
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </td>
              <td>
                {isDraft && lineItems.length > 1 && (
                  <button onClick={() => removeItem(i)}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isDraft && <button onClick={addItem}>+ Add line</button>}

      <h3>Totals</h3>
      <ul>
        {Object.entries(initial.totals).map(([currency, minor]) => (
          <li key={currency}>{formatMinor(minor, currency)}</li>
        ))}
      </ul>

      <h3>Valid until</h3>
      <input
        type="date"
        value={validUntil}
        onChange={(e) => setValidUntil(e.target.value)}
        disabled={!isDraft}
      />

      {isDraft && (
        <div style={{ marginTop: 16 }}>
          <button onClick={save} disabled={busy}>Save draft</button>{" "}
          <button onClick={send} disabled={busy}>Send to client</button>
        </div>
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
