"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface EditorWelcomeDoc {
  id: string;
  content: string;
  status: string;
}

export function WelcomeDocEditor({ initial }: { initial: EditorWelcomeDoc }) {
  const router = useRouter();
  const [content, setContent] = useState(initial.content);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/welcome-docs/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
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

  async function send() {
    setBusy(true);
    setMessage(null);
    await save();
    const res = await fetch(`/api/welcome-docs/${initial.id}/send`, { method: "POST" });
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
      <h1>Welcome Doc — {initial.status}</h1>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={!isDraft}
        rows={14}
        style={{ width: "100%" }}
      />
      {isDraft && (
        <div style={{ marginTop: 8 }}>
          <button onClick={save} disabled={busy}>Save draft</button>{" "}
          <button onClick={send} disabled={busy}>Send to client</button>
        </div>
      )}
      {message && <p>{message}</p>}
      {sentInfo && (
        <p>
          Sent. {sentInfo.emailed ? "Emailed to the client." : "Email not configured — share this link manually:"}{" "}
          <a href={sentInfo.publicUrl}>{sentInfo.publicUrl}</a>
        </p>
      )}
    </div>
  );
}
