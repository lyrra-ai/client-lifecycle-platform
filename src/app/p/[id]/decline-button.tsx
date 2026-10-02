"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeclineButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decline() {
    setBusy(true);
    await fetch(`/api/public-proposals/${proposalId}/decline`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={decline} disabled={busy}>
      Decline
    </button>
  );
}
