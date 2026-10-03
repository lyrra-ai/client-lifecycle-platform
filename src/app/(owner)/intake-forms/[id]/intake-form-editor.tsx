"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface EditorQuestion {
  id: string;
  label: string;
  required: boolean;
}

export interface EditorIntakeForm {
  id: string;
  status: string;
  questions: EditorQuestion[];
  response: { answers: Record<string, string>; submittedAt: string } | null;
}

export function IntakeFormEditor({ initial }: { initial: EditorIntakeForm }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<EditorQuestion[]>(initial.questions);
  const [busy, setBusy] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean; whatsapped: boolean } | null>(null);

  function update(i: number, patch: Partial<EditorQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function move(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const next = [...qs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return qs;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { id: crypto.randomUUID(), label: "", required: false }]);
  }

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/intake-forms/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions }),
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

  async function regenerate() {
    setBusy(true);
    const res = await fetch(`/api/intake-forms/${initial.id}/regenerate`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't regenerate.");
      return;
    }
    setQuestions(data.form.questions);
    toast("Regenerated from current scope — review before sending.");
  }

  async function send() {
    setBusy(true);
    await save();
    const res = await fetch(`/api/intake-forms/${initial.id}/send`, { method: "POST" });
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
        <h1 className="font-serif text-3xl">Intake Form</h1>
        <Badge variant="secondary" className="capitalize">
          {initial.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        <em>Editable at any time, even after sending — scope changes happen (PRD §9).</em>
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2">
              <Input value={q.label} onChange={(e) => update(i, { label: e.target.value })} className="flex-1" />
              <Label className="flex items-center gap-1.5 whitespace-nowrap text-sm font-normal">
                <Checkbox checked={q.required} onCheckedChange={(v) => update(i, { required: Boolean(v) })} />
                Required
              </Label>
              <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                <ChevronUp />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>
                <ChevronDown />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => remove(i)}>
                <X />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={addQuestion}>
            + Add question
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={save} disabled={busy}>
          Save
        </Button>
        <Button variant="outline" onClick={regenerate} disabled={busy}>
          Regenerate from scope
        </Button>
        <Button onClick={send} disabled={busy}>
          Send to client
        </Button>
      </div>

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

      {initial.response && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Client&apos;s answers (submitted {new Date(initial.response.submittedAt).toLocaleString()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {questions.map((q) => (
                <li key={q.id}>
                  <strong>{q.label}:</strong> {initial.response!.answers[q.id] || "(no answer)"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
