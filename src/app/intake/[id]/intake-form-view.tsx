"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface PublicQuestion {
  id: string;
  label: string;
  required: boolean;
}

export function IntakeFormView({ formId, questions }: { formId: string; questions: PublicQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public-intake-forms/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't submit.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-sm text-success">Thank you — your answers have been sent.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <Label>
            {q.label}
            {q.required && " *"}
          </Label>
          <Textarea
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            required={q.required}
          />
        </div>
      ))}
      <Button type="submit" disabled={busy} className="self-start">
        Submit
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
