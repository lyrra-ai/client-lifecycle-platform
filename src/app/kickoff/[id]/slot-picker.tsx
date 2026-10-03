"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    return <p className="text-sm text-success">Confirmed for {new Date(picked).toLocaleString()}. See you then!</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Pick a time that works:</p>
      {slots.map((slot) => (
        <Button key={slot} variant="outline" className="justify-start" onClick={() => pick(slot)} disabled={busy}>
          {new Date(slot).toLocaleString()}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
