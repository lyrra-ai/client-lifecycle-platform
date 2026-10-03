"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface EditorInvoice {
  id: string;
  type: string;
  amount: number;
  currency: string;
  gstApplicable: boolean;
  gstBreakup: Record<string, string | undefined> | null;
  status: string;
  dueDate: string | null;
}

export function InvoiceEditor({ initial }: { initial: EditorInvoice }) {
  const router = useRouter();
  const [amountMajor, setAmountMajor] = useState(initial.amount);
  const [gstApplicable, setGstApplicable] = useState(initial.gstApplicable);
  const [dueDate, setDueDate] = useState(initial.dueDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean; whatsapped: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/invoices/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountMajor, gstApplicable, dueDate: dueDate || null }),
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
    const res = await fetch(`/api/invoices/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed, whatsapped: data.whatsapped });
    router.refresh();
  }

  async function voidAndReissue() {
    setBusy(true);
    const res = await fetch(`/api/invoices/${initial.id}/void`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't void.");
      return;
    }
    toast("Voided. Create a new invoice from the engagement page to reissue.");
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl capitalize">{initial.type} invoice</h1>
        <Badge variant={isDraft ? "secondary" : "default"} className="capitalize">
          {initial.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Amount</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                className="w-40"
                value={amountMajor}
                onChange={(e) => setAmountMajor(Number(e.target.value))}
                disabled={!isDraft}
              />
            </div>
            <p className="pb-2 font-mono text-sm text-muted-foreground">{initial.currency}</p>
          </div>

          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={gstApplicable} onCheckedChange={(v) => setGstApplicable(Boolean(v))} disabled={!isDraft} />
            GST applicable
          </Label>

          {initial.gstBreakup && (
            <ul className="flex flex-col gap-1 font-mono text-sm text-muted-foreground">
              {Object.entries(initial.gstBreakup)
                .filter(([k]) => k !== "hsnSac")
                .map(([k, v]) => (
                  <li key={k}>
                    {k.toUpperCase()}: {v}
                  </li>
                ))}
              <li>HSN/SAC: {initial.gstBreakup.hsnSac}</li>
            </ul>
          )}
          {gstApplicable && !initial.gstBreakup && (
            <p className="text-sm text-muted-foreground">
              <em>GST breakup not computed — set the business state (Settings) and the client&apos;s state.</em>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              className="w-40"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!isDraft}
            />
          </div>
        </CardContent>
      </Card>

      {isDraft && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={busy}>
            Save draft
          </Button>
          <Button onClick={send} disabled={busy}>
            Send to client
          </Button>
        </div>
      )}
      {initial.status === "sent" && (
        <Button variant="outline" onClick={voidAndReissue} disabled={busy} className="self-start">
          Void (correction requires a new invoice)
        </Button>
      )}

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
    </div>
  );
}
