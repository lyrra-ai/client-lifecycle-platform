"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { FollowUpTaskRow } from "@/services/followup";

const TARGET_LABELS: Record<string, string> = {
  proposal: "Proposal",
  invoice: "Invoice",
  intake_form: "Intake form",
  access_request: "Access request",
};

export function FollowupList({ tasks }: { tasks: FollowUpTaskRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [snoozeReason, setSnoozeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openReview(task: FollowUpTaskRow) {
    setOpenId(task.id);
    setMessage(task.draftMessage ?? "");
    setError(null);
  }

  async function send(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/followup-tasks/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send.");
      return;
    }
    setOpenId(null);
    router.refresh();
  }

  async function snooze(id: string) {
    if (!snoozeUntil || !snoozeReason.trim()) return;
    setBusy(true);
    await fetch(`/api/followup-tasks/${id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: snoozeUntil, reason: snoozeReason }),
    });
    setBusy(false);
    setOpenId(null);
    router.refresh();
  }

  async function resolve(id: string) {
    setBusy(true);
    await fetch(`/api/followup-tasks/${id}/resolve`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (tasks.length === 0) {
    return <p>Nothing waiting on a client right now.</p>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th align="left">Client</th>
          <th align="left">Outstanding</th>
          <th align="left">Days</th>
          <th align="left"></th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <Fragment key={t.id}>
            <tr>
              <td>{t.clientName}</td>
              <td>{TARGET_LABELS[t.targetType] ?? t.targetType}, attempt {t.attempts + 1}</td>
              <td>{t.daysOutstanding}d</td>
              <td>
                {t.snoozedUntil && new Date(t.snoozedUntil) > new Date() ? (
                  <em>Snoozed until {new Date(t.snoozedUntil).toLocaleDateString()}</em>
                ) : (
                  <button onClick={() => openReview(t)} disabled={!t.draftMessage}>
                    {t.draftMessage ? "Review & Send" : "Draft pending..."}
                  </button>
                )}{" "}
                <button onClick={() => resolve(t.id)} disabled={busy}>Mark resolved</button>
              </td>
            </tr>
            {openId === t.id && (
              <tr>
                <td colSpan={4}>
                  <div style={{ border: "1px solid #ccc", padding: 12 }}>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      style={{ width: "100%" }}
                    />
                    <button onClick={() => send(t.id)} disabled={busy}>Send</button>{" "}
                    <button onClick={() => setOpenId(null)}>Cancel</button>

                    <div style={{ marginTop: 8 }}>
                      <input type="date" value={snoozeUntil} onChange={(e) => setSnoozeUntil(e.target.value)} />
                      <input
                        placeholder="Snooze reason"
                        value={snoozeReason}
                        onChange={(e) => setSnoozeReason(e.target.value)}
                      />
                      <button onClick={() => snooze(t.id)} disabled={busy}>Snooze</button>
                    </div>
                    {error && <p style={{ color: "crimson" }}>{error}</p>}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
