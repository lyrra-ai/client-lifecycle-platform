"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [message, setMessage] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean } | null>(null);

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
    setMessage(null);
    const res = await fetch(`/api/intake-forms/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't save.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  async function regenerate() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/intake-forms/${initial.id}/regenerate`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't regenerate.");
      return;
    }
    setQuestions(data.form.questions);
    setMessage("Regenerated from current scope — review before sending.");
  }

  async function send() {
    setBusy(true);
    setMessage(null);
    await save();
    const res = await fetch(`/api/intake-forms/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed });
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Intake Form — {initial.status}</h1>
      <p><em>Editable at any time, even after sending — scope changes happen (PRD §9).</em></p>

      {questions.map((q, i) => (
        <div key={q.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input
            value={q.label}
            onChange={(e) => update(i, { label: e.target.value })}
            style={{ flex: 1 }}
          />
          <label>
            <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required
          </label>
          <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button onClick={() => move(i, 1)} disabled={i === questions.length - 1}>↓</button>
          <button onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button onClick={addQuestion}>+ Add question</button>

      <div style={{ marginTop: 16 }}>
        <button onClick={save} disabled={busy}>Save</button>{" "}
        <button onClick={regenerate} disabled={busy}>Regenerate from scope</button>{" "}
        <button onClick={send} disabled={busy}>Send to client</button>
      </div>

      {message && <p>{message}</p>}
      {sentInfo && (
        <p>
          Sent. {sentInfo.emailed ? "Emailed to the client." : "Email not configured — share this link manually:"}{" "}
          <a href={sentInfo.publicUrl}>{sentInfo.publicUrl}</a>
        </p>
      )}

      {initial.response && (
        <div style={{ marginTop: 24, border: "1px solid #ccc", padding: 12 }}>
          <h3>Client's answers (submitted {new Date(initial.response.submittedAt).toLocaleString()})</h3>
          <ul>
            {questions.map((q) => (
              <li key={q.id}><strong>{q.label}:</strong> {initial.response!.answers[q.id] || "(no answer)"}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
