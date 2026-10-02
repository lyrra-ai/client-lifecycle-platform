"use client";

import { useState } from "react";
import { looksLikeCredential } from "@/lib/credential-check";

export interface ChecklistItemData {
  id: string;
  platform: string;
  instructions: string;
  status: string;
}

export function ChecklistItem({ item }: { item: ChecklistItemData }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function markDone() {
    // First line of defense, immediate feedback — the real boundary is
    // server-side (System Design §4): AccessRequest has no column this
    // note could land in even if this client check is bypassed.
    if (note && looksLikeCredential(note)) {
      setError(
        "That looks like it might contain a password or login — please use the platform's own invite feature instead.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public-access-requests/${item.id}/mark-done`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't update.");
      return;
    }
    setStatus("granted");
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
      <h3>{item.platform}</h3>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{item.instructions}</pre>
      {status === "requested" ? (
        <>
          <input
            placeholder="Optional note (never a password)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 8 }}
          />
          <button onClick={markDone} disabled={busy}>Mark done</button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </>
      ) : (
        <p><strong>{status}</strong></p>
      )}
    </div>
  );
}
