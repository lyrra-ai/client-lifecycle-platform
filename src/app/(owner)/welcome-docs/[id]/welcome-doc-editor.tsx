"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface EditorWelcomeDoc {
  id: string;
  content: string;
  status: string;
}

export function WelcomeDocEditor({ initial }: { initial: EditorWelcomeDoc }) {
  const router = useRouter();
  const [content, setContent] = useState(initial.content);
  const [busy, setBusy] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean; whatsapped: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/welcome-docs/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't save.");
      return;
    }
    toast("Saved.");
    router.refresh();
  }

  async function send() {
    setBusy(true);
    await save();
    const res = await fetch(`/api/welcome-docs/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed, whatsapped: data.whatsapped });
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Welcome Doc</h1>
        <Badge variant={isDraft ? "secondary" : "default"} className="capitalize">
          {initial.status}
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} disabled={!isDraft} rows={14} />
        </CardContent>
      </Card>

      {isDraft && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={busy}>
            Save draft
          </Button>
          <Button onClick={send} disabled={busy}>
            Send to client
          </Button>
        </div>
      )}

      {sentInfo && (
        <p className="text-sm text-muted-foreground">
          Sent.{" "}
          {sentInfo.whatsapped
            ? "Sent via WhatsApp."
            : sentInfo.emailed
              ? "Emailed to the client."
              : "Neither channel is configured — share this link manually:"}{" "}
          <a href={sentInfo.publicUrl} className="text-accent-foreground hover:underline">
            {sentInfo.publicUrl}
          </a>
        </p>
      )}
    </div>
  );
}
