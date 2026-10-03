"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Deliverables carry a signed, time-boxed download url (resolved server-side
// from the stored storageKey) whenever read back from the API — but what
// gets PUT/POSTed to save this packet is storageKey, not url (see note on save()).
export interface Deliverable {
  fileName: string;
  storageKey: string;
  url?: string;
}

export interface EditorHandoverPacket {
  id: string;
  engagementId: string;
  deliverables: Deliverable[];
  summary: string;
  sentAt: string | null;
}

export function HandoverEditor({ initial }: { initial: EditorHandoverPacket }) {
  const router = useRouter();
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initial.deliverables);
  const [summary, setSummary] = useState(initial.summary);
  const [busy, setBusy] = useState(false);

  const isDraft = !initial.sentAt;

  function removeRow(i: number) {
    setDeliverables((ds) => ds.filter((_, idx) => idx !== i));
  }

  async function uploadFile(file: File) {
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/engagements/${initial.engagementId}/handover-packet/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Upload failed.");
      return;
    }
    setDeliverables((ds) => [...ds, { fileName: data.fileName, storageKey: data.storageKey }]);
  }

  async function save() {
    setBusy(true);
    // storageKey is the stable identity the server stores; url is a signed
    // link regenerated on every read, so it's never sent back on save.
    const res = await fetch(`/api/handover-packets/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliverables: deliverables.map((d) => ({ fileName: d.fileName, storageKey: d.storageKey })),
        summary,
      }),
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
    const res = await fetch(`/api/handover-packets/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't send.");
      return;
    }
    toast(`Sent. ${data.emailed ? "Emailed to the client." : "Share this link manually: " + data.publicUrl}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Handover Packet</h1>
        <Badge variant={isDraft ? "secondary" : "default"}>{initial.sentAt ? "sent" : "draft"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!isDraft} rows={8} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deliverables</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {deliverables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {deliverables.map((d, i) => (
                <li key={d.storageKey} className="flex items-center gap-2">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-accent-foreground hover:underline">
                      {d.fileName}
                    </a>
                  ) : (
                    <span className="flex-1 text-sm">{d.fileName}</span>
                  )}
                  {isDraft && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeRow(i)}>
                      <X />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isDraft && (
            <Input
              type="file"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.target.value = "";
              }}
            />
          )}
        </CardContent>
      </Card>

      {isDraft && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={busy}>
            Save
          </Button>
          <Button onClick={send} disabled={busy}>
            Send to client
          </Button>
        </div>
      )}
    </div>
  );
}
