"use client";

import { useState } from "react";
import { looksLikeCredential } from "@/lib/credential-check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ChecklistItemData {
  id: string;
  platform: string;
  instructions: string;
  status: string;
}

export function ChecklistItem({ item }: { item: ChecklistItemData }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function markDone() {
    // First line of defense, immediate feedback — the real boundary is
    // server-side (System Design §4): AccessRequest has no column this
    // note could land in even if this client check is bypassed.
    if (note && looksLikeCredential(note)) {
      setError(
        "That looks like it might contain a password or login — please use the platform's own invite feature instead.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public-access-requests/${item.id}/mark-done`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't update.");
      return;
    }
    setStatus("granted");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {item.platform}
          {status !== "requested" && <Badge variant="secondary">{status}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{item.instructions}</pre>
        {status === "requested" && (
          <div className="mt-3 flex flex-col gap-2">
            <Input
              placeholder="Optional note (never a password)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" className="self-start" onClick={markDone} disabled={busy}>
              Mark done
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
