"use client";

import { useState } from "react";

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
    return <p>Thank you — your answers have been sent.</p>;
  }

  return (
    <form onSubmit={submit}>
      {questions.map((q) => (
        <div key={q.id} style={{ marginBottom: 16 }}>
          <label>
            {q.label}{q.required && " *"}
            <textarea
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              required={q.required}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
        </div>
      ))}
      <button type="submit" disabled={busy}>Submit</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </form>
  );
}
