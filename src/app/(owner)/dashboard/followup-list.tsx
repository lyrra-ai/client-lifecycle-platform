"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { FollowUpTaskRow } from "@/services/followup";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const TARGET_LABELS: Record<string, string> = {
  proposal: "Proposal",
  invoice: "Invoice",
  intake_form: "Intake form",
  access_request: "Access request",
  feedback_request: "Feedback request",
};

export function FollowupList({ tasks }: { tasks: FollowUpTaskRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [snoozeReason, setSnoozeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openReview(task: FollowUpTaskRow) {
    setOpenId(task.id);
    setMessage(task.draftMessage ?? "");
    setError(null);
  }

  async function send(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/followup-tasks/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send.");
      return;
    }
    setOpenId(null);
    router.refresh();
  }

  async function snooze(id: string) {
    if (!snoozeUntil || !snoozeReason.trim()) return;
    setBusy(true);
    await fetch(`/api/followup-tasks/${id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: snoozeUntil, reason: snoozeReason }),
    });
    setBusy(false);
    setOpenId(null);
    router.refresh();
  }

  async function resolve(id: string) {
    setBusy(true);
    await fetch(`/api/followup-tasks/${id}/resolve`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing waiting on a client right now.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Outstanding</TableHead>
          <TableHead>Days</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <Fragment key={t.id}>
            <TableRow>
              <TableCell className="font-medium">{t.clientName}</TableCell>
              <TableCell>
                {TARGET_LABELS[t.targetType] ?? t.targetType}, attempt {t.attempts + 1}
              </TableCell>
              <TableCell>
                <Badge variant={t.daysOutstanding > 7 ? "destructive" : "secondary"}>{t.daysOutstanding}d</Badge>
              </TableCell>
              <TableCell className="flex items-center gap-2">
                {t.snoozedUntil && new Date(t.snoozedUntil) > new Date() ? (
                  <em className="text-sm text-muted-foreground">Snoozed until {new Date(t.snoozedUntil).toLocaleDateString()}</em>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => openReview(t)} disabled={!t.draftMessage}>
                    {t.draftMessage ? "Review & Send" : "Draft pending…"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => resolve(t.id)} disabled={busy}>
                  Mark resolved
                </Button>
              </TableCell>
            </TableRow>
            {openId === t.id && (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => send(t.id)} disabled={busy}>
                        Send
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                        Cancel
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 border-t pt-3">
                      <Input
                        type="date"
                        className="w-40"
                        value={snoozeUntil}
                        onChange={(e) => setSnoozeUntil(e.target.value)}
                      />
                      <Input
                        placeholder="Snooze reason"
                        value={snoozeReason}
                        onChange={(e) => setSnoozeReason(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={() => snooze(t.id)} disabled={busy}>
                        Snooze
                      </Button>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
