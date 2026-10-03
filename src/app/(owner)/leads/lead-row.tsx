"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";

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
    <TableRow>
      <TableCell className="font-medium">{lead.client?.name ?? "—"}</TableCell>
      <TableCell>{lead.client?.company ?? "—"}</TableCell>
      <TableCell className="capitalize">{lead.source.replace(/_/g, " ")}</TableCell>
      <TableCell className="text-muted-foreground">{daysSince(lead.createdAt)}d</TableCell>
      <TableCell>
        <Badge variant={lead.status === "lost" ? "destructive" : "secondary"}>{lead.status}</Badge>
      </TableCell>
      <TableCell className="flex gap-2">
        {lead.status !== "lost" && (
          <>
            <Button size="sm" variant="outline" onClick={createProposal} disabled={busy}>
              Create Proposal
            </Button>
            <Button size="sm" variant="ghost" onClick={markLost} disabled={busy}>
              Mark lost
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
