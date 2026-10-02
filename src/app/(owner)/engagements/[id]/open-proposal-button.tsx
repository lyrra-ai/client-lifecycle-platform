"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OpenProposalButton({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const res = await fetch(`/api/engagements/${engagementId}/proposal`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/proposals/${data.proposalId}`);
  }

  return (
    <button onClick={open} disabled={busy}>
      Open Proposal
    </button>
  );
}
