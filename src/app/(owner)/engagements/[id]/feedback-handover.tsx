"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FeedbackRequestRow {
  id: string;
  sentAt: string;
  response: { rating: number; comments: string | null } | null;
}

export function FeedbackHandover({
  engagementId,
  feedbackRequests,
  handoverPacketId,
}: {
  engagementId: string;
  feedbackRequests: FeedbackRequestRow[];
  handoverPacketId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function requestFeedback() {
    setBusy(true);
    await fetch(`/api/engagements/${engagementId}/feedback-request`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function createHandover() {
    setBusy(true);
    const res = await fetch(`/api/engagements/${engagementId}/handover-packet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliverables: [] }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/handover-packets/${data.packet.id}`);
  }

  return (
    <div>
      <h3>Feedback</h3>
      {feedbackRequests.length === 0 && <p>No feedback requests yet.</p>}
      <ul>
        {feedbackRequests.map((r) => (
          <li key={r.id}>
            {new Date(r.sentAt).toLocaleDateString()} —{" "}
            {r.response ? `${r.response.rating}/5${r.response.comments ? `: ${r.response.comments}` : ""}` : "awaiting response"}
          </li>
        ))}
      </ul>
      <button onClick={requestFeedback} disabled={busy}>Request Feedback</button>

      <h3>Handover</h3>
      {handoverPacketId ? (
        <p><a href={`/handover-packets/${handoverPacketId}`}>Handover packet</a></p>
      ) : (
        <button onClick={createHandover} disabled={busy}>Create Handover Packet</button>
      )}
    </div>
  );
}
