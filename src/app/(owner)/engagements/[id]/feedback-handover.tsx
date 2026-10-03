"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {feedbackRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback requests yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {feedbackRequests.map((r) => (
              <li key={r.id}>
                {new Date(r.sentAt).toLocaleDateString()} —{" "}
                {r.response ? `${r.response.rating}/5${r.response.comments ? `: ${r.response.comments}` : ""}` : "awaiting response"}
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" className="self-start" onClick={requestFeedback} disabled={busy}>
          Request Feedback
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm font-medium">Handover</p>
        {handoverPacketId ? (
          <a href={`/handover-packets/${handoverPacketId}`} className="text-sm text-accent-foreground hover:underline">
            Handover packet
          </a>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={createHandover} disabled={busy}>
            Create Handover Packet
          </Button>
        )}
      </div>
    </div>
  );
}
