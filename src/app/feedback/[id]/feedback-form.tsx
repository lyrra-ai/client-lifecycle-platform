"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    return <p className="text-sm text-success">Thank you for your feedback!</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Rating (1-5)</Label>
        <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Comments (optional)</Label>
        <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4} />
      </div>
      <Button type="submit" disabled={busy} className="self-start">
        Submit
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
