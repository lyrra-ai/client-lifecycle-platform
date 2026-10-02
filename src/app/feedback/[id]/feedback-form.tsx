"use client";

import { useState } from "react";

export function FeedbackForm({ requestId }: { requestId: string }) {
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public-feedback-requests/${requestId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comments: comments || undefined }),
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
    return <p>Thank you for your feedback!</p>;
  }

  return (
    <form onSubmit={submit}>
      <label>
        Rating (1-5)
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))} style={{ display: "block", marginTop: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Comments (optional)
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={4}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>
      <button type="submit" disabled={busy} style={{ marginTop: 12 }}>Submit</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </form>
  );
}
