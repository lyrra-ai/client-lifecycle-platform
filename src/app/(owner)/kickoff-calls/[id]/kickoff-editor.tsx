"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AgendaSection {
  title: string;
  durationMinutes: number;
  talkingPoints: string[];
}

export interface ActionItem {
  description: string;
  owner: "agency" | "client";
  done: boolean;
}

export interface EditorKickoffCall {
  id: string;
  status: string;
  scheduledAt: string | null;
  proposedSlots: string[];
  agenda: AgendaSection[] | null;
  summary: { summaryText: string; actionItems: ActionItem[] } | null;
}

export function KickoffEditor({ initial }: { initial: EditorKickoffCall }) {
  const router = useRouter();
  const [agenda] = useState<AgendaSection[]>(initial.agenda ?? []);
  const [notes, setNotes] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveAgenda() {
    setBusy(true);
    const res = await fetch(`/api/kickoff/${initial.id}/agenda`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: agenda }),
    });
    setBusy(false);
    toast(res.ok ? "Agenda saved." : "Couldn't save agenda.");
    router.refresh();
  }

  async function markNoShow() {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/no-show`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function reschedule() {
    const slots = rescheduleSlots.split(",").map((s) => s.trim()).filter(Boolean);
    if (slots.length === 0) return;
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposedSlots: slots }),
    });
    setBusy(false);
    setRescheduleSlots("");
    router.refresh();
  }

  async function markDone() {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/done`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function generateSummary() {
    setBusy(true);
    const res = await fetch(`/api/kickoff/${initial.id}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined, recordingUrl: recordingUrl || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't generate summary.");
      return;
    }
    router.refresh();
  }

  async function toggleItem(index: number, done: boolean) {
    setBusy(true);
    await fetch(`/api/kickoff/${initial.id}/action-items/${index}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Kickoff Call</h1>
        <Badge variant="secondary" className="capitalize">
          {initial.status}
        </Badge>
      </div>
      {initial.scheduledAt ? (
        <p className="text-sm text-muted-foreground">Scheduled for {new Date(initial.scheduledAt).toLocaleString()}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Waiting on the client to pick a slot: {initial.proposedSlots.join(", ")}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {agenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agenda generated yet.</p>
          ) : (
            agenda.map((section, i) => (
              <div key={i}>
                <p className="text-sm font-medium">
                  {section.title} <span className="text-muted-foreground">({section.durationMinutes} min)</span>
                </p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {section.talkingPoints.map((tp, j) => (
                    <li key={j}>{tp}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <Button variant="outline" size="sm" className="self-start" onClick={saveAgenda} disabled={busy}>
            Save agenda
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markNoShow} disabled={busy}>
              Mark no-show
            </Button>
            <Button variant="outline" size="sm" onClick={markDone} disabled={busy}>
              Mark done
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="New slots, comma-separated ISO datetimes"
              value={rescheduleSlots}
              onChange={(e) => setRescheduleSlots(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={reschedule} disabled={busy}>
              Reschedule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Post-call summary</CardTitle>
        </CardHeader>
        <CardContent>
          {initial.summary ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{initial.summary.summaryText}</p>
              <ul className="flex flex-col gap-2">
                {initial.summary.actionItems.map((item, i) => (
                  <li key={i}>
                    <Label className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox checked={item.done} onCheckedChange={(v) => toggleItem(i, Boolean(v))} />
                      <Badge variant="outline" className="capitalize">
                        {item.owner}
                      </Badge>
                      {item.description}
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Textarea
                placeholder="Paste rough notes from the call (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
              <Input
                placeholder="Recording URL (optional)"
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
              />
              <Button variant="outline" size="sm" className="self-start" onClick={generateSummary} disabled={busy}>
                Generate summary
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
