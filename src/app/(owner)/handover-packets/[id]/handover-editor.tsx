"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface Deliverable {
  fileName: string;
  url: string;
}

export interface EditorHandoverPacket {
  id: string;
  deliverables: Deliverable[];
  summary: string;
  sentAt: string | null;
}

export function HandoverEditor({ initial }: { initial: EditorHandoverPacket }) {
  const router = useRouter();
  const [deliverables, setDeliverables] = useState<Deliverable[]>(
    initial.deliverables.length ? initial.deliverables : [{ fileName: "", url: "" }],
  );
  const [summary, setSummary] = useState(initial.summary);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isDraft = !initial.sentAt;

  function update(i: number, patch: Partial<Deliverable>) {
    setDeliverables((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function addRow() {
    setDeliverables((ds) => [...ds, { fileName: "", url: "" }]);
  }

  function removeRow(i: number) {
    setDeliverables((ds) => ds.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/handover-packets/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliverables: deliverables.filter((d) => d.fileName.trim()), summary }),
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
    const res = await fetch(`/api/handover-packets/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't send.");
      return;
    }
    setMessage(`Sent. ${data.emailed ? "Emailed to the client." : "Share this link manually: " + data.publicUrl}`);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Handover Packet — {initial.sentAt ? "sent" : "draft"}</h1>

      <h3>Summary</h3>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={!isDraft}
        rows={8}
        style={{ width: "100%" }}
      />

      <h3>Deliverables</h3>
      {deliverables.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="File name"
            value={d.fileName}
            onChange={(e) => update(i, { fileName: e.target.value })}
            disabled={!isDraft}
            style={{ flex: 1 }}
          />
          <input
            placeholder="URL"
            value={d.url}
            onChange={(e) => update(i, { url: e.target.value })}
            disabled={!isDraft}
            style={{ flex: 2 }}
          />
          {isDraft && <button onClick={() => removeRow(i)}>Remove</button>}
        </div>
      ))}
      {isDraft && <button onClick={addRow}>+ Add deliverable</button>}

      {isDraft && (
        <div style={{ marginTop: 16 }}>
          <button onClick={save} disabled={busy}>Save</button>{" "}
          <button onClick={send} disabled={busy}>Send to client</button>
        </div>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}
