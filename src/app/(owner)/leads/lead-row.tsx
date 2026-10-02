"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LeadRowData {
  id: string;
  status: string;
  source: string;
  createdAt: string;
  client: { name: string; company: string | null } | null;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function LeadRow({ lead }: { lead: LeadRowData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createProposal() {
    setBusy(true);
    const res = await fetch(`/api/leads/${lead.id}/engagement`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      router.push(`/engagements/${data.engagement.id}`);
    }
  }

  async function markLost() {
    setBusy(true);
    await fetch(`/api/leads/${lead.id}/lost`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <tr>
      <td>{lead.client?.name ?? "—"}</td>
      <td>{lead.client?.company ?? "—"}</td>
      <td>{lead.source}</td>
      <td>{daysSince(lead.createdAt)}d</td>
      <td>{lead.status}</td>
      <td>
        {lead.status !== "lost" && (
          <>
            <button onClick={createProposal} disabled={busy}>
              Create Proposal
            </button>{" "}
            <button onClick={markLost} disabled={busy}>
              Mark lost
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
