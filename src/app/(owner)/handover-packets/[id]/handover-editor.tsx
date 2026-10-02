"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Deliverables carry a signed, time-boxed download url (resolved server-side
// from the stored storageKey) whenever read back from the API — but what
// gets PUT/POSTed to save this packet is storageKey, not url (see note on save()).
export interface Deliverable {
  fileName: string;
  storageKey: string;
  url?: string;
}

export interface EditorHandoverPacket {
  id: string;
  engagementId: string;
  deliverables: Deliverable[];
  summary: string;
  sentAt: string | null;
}

export function HandoverEditor({ initial }: { initial: EditorHandoverPacket }) {
  const router = useRouter();
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initial.deliverables);
  const [summary, setSummary] = useState(initial.summary);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isDraft = !initial.sentAt;

  function removeRow(i: number) {
    setDeliverables((ds) => ds.filter((_, idx) => idx !== i));
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/engagements/${initial.engagementId}/handover-packet/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Upload failed.");
      return;
    }
    setDeliverables((ds) => [...ds, { fileName: data.fileName, storageKey: data.storageKey }]);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    // storageKey is the stable identity the server stores; url is a signed
    // link regenerated on every read, so it's never sent back on save.
    const res = await fetch(`/api/handover-packets/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliverables: deliverables.map((d) => ({ fileName: d.fileName, storageKey: d.storageKey })),
        summary,
      }),
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
        <div key={d.storageKey} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          {d.url ? (
            <a href={d.url} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{d.fileName}</a>
          ) : (
            <span style={{ flex: 1 }}>{d.fileName}</span>
          )}
          {isDraft && <button onClick={() => removeRow(i)}>Remove</button>}
        </div>
      ))}
      {deliverables.length === 0 && <p>No files uploaded yet.</p>}
      {isDraft && (
        <input
          type="file"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
            e.target.value = "";
          }}
        />
      )}

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
