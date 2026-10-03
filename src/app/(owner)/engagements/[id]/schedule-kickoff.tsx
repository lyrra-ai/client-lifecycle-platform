"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Schedule Kickoff
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <Input
        placeholder="Proposed times, comma-separated ISO datetimes (e.g. 2026-10-10T15:00:00Z, 2026-10-11T15:00:00Z)"
        value={slots}
        onChange={(e) => setSlots(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={schedule} disabled={busy}>
          Schedule
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
