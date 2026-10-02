"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScheduleKickoff({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function schedule() {
    const proposedSlots = slots.split(",").map((s) => s.trim()).filter(Boolean);
    if (proposedSlots.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${engagementId}/kickoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposedSlots }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't schedule.");
      return;
    }
    router.push(`/kickoff-calls/${data.call.id}`);
  }

  if (!open) {
    return <button onClick={() => setOpen(true)}>Schedule Kickoff</button>;
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: 12, marginTop: 8 }}>
      <input
        placeholder="Proposed times, comma-separated ISO datetimes (e.g. 2026-10-10T15:00:00Z, 2026-10-11T15:00:00Z)"
        value={slots}
        onChange={(e) => setSlots(e.target.value)}
        style={{ width: "100%" }}
      />
      <button onClick={schedule} disabled={busy} style={{ marginTop: 8 }}>Schedule</button>{" "}
      <button onClick={() => setOpen(false)}>Cancel</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
