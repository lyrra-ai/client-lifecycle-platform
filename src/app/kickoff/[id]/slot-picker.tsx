"use client";

import { useState } from "react";

export function SlotPicker({ callId, slots }: { callId: string; slots: string[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(slot: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public-kickoff/${callId}/pick-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't confirm that time.");
      return;
    }
    setPicked(slot);
  }

  if (picked) {
    return <p>Confirmed for {new Date(picked).toLocaleString()}. See you then!</p>;
  }

  return (
    <div>
      <p>Pick a time that works:</p>
      {slots.map((slot) => (
        <button key={slot} onClick={() => pick(slot)} disabled={busy} style={{ display: "block", marginBottom: 8 }}>
          {new Date(slot).toLocaleString()}
        </button>
      ))}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
