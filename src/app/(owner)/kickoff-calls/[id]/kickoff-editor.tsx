"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface AgendaSection {
  title: string;
  durationMinutes: number;
  talkingPoints: string[];
}

export interface ActionItem {
  description: string;
  owner: "agency" | "client";
  done: boolean;
}

export interface EditorKickoffCall {
  id: string;
  status: string;
  scheduledAt: string | null;
  proposedSlots: string[];
  agenda: AgendaSection[] | null;
  summary: { summaryText: string; actionItems: ActionItem[] } | null;
}

export function KickoffEditor({ initial }: { initial: EditorKickoffCall }) {
  const router = useRouter();
  const [agenda, setAgenda] = useState<AgendaSection[]>(initial.agenda ?? []);
  const [notes, setNotes] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveAgenda() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/kickoff/${initial.id}/agenda`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: agenda }),
    });
    setBusy(false);
    setMessage(res.ok ? "Agenda saved." : "Couldn't save agenda.");
    router.refresh();
  }

  async function markNoShow() {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/no-show`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function reschedule() {
    const slots = rescheduleSlots.split(",").map((s) => s.trim()).filter(Boolean);
    if (slots.length === 0) return;
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposedSlots: slots }),
    });
    setBusy(false);
    setRescheduleSlots("");
    router.refresh();
  }

  async function markDone() {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/done`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function generateSummary() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/kickoff/${initial.id}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined, recordingUrl: recordingUrl || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't generate summary.");
      return;
    }
    router.refresh();
  }

  async function toggleItem(index: number, done: boolean) {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/action-items/${index}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Kickoff Call — {initial.status}</h1>
      {initial.scheduledAt ? (
        <p>Scheduled for {new Date(initial.scheduledAt).toLocaleString()}</p>
      ) : (
        <p>Waiting on the client to pick a slot: {initial.proposedSlots.join(", ")}</p>
      )}

      <h3>Agenda</h3>
      {agenda.map((section, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <strong>{section.title}</strong> ({section.durationMinutes} min)
          <ul>
            {section.talkingPoints.map((tp, j) => <li key={j}>{tp}</li>)}
          </ul>
        </div>
      ))}
      <button onClick={saveAgenda} disabled={busy}>Save agenda</button>

      <h3>Status actions</h3>
      <button onClick={markNoShow} disabled={busy}>Mark no-show</button>{" "}
      <button onClick={markDone} disabled={busy}>Mark done</button>
      <div style={{ marginTop: 8 }}>
        <input
          placeholder="New slots, comma-separated ISO datetimes"
          value={rescheduleSlots}
          onChange={(e) => setRescheduleSlots(e.target.value)}
          style={{ width: "60%" }}
        />
        <button onClick={reschedule} disabled={busy}>Reschedule</button>
      </div>

      <h3>Post-call summary</h3>
      {initial.summary ? (
        <div>
          <p>{initial.summary.summaryText}</p>
          <ul>
            {initial.summary.actionItems.map((item, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={(e) => toggleItem(i, e.target.checked)} />
                  [{item.owner}] {item.description}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <textarea
            placeholder="Paste rough notes from the call (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            style={{ width: "100%" }}
          />
          <input
            placeholder="Recording URL (optional)"
            value={recordingUrl}
            onChange={(e) => setRecordingUrl(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 8 }}
          />
          <button onClick={generateSummary} disabled={busy} style={{ marginTop: 8 }}>Generate summary</button>
        </div>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}
