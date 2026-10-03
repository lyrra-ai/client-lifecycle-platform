"use client";

/**
 * Proposal editor (PRD §4) — line-item table (add/remove/reorder rows),
 * a cover-note area (AI-draftable, always editable before sending),
 * currency per line item, auto-calculated totals per currency.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface EditorLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  currency: string;
}

export interface EditorInitialData {
  id: string;
  status: string;
  coverNote: string | null;
  validUntil: string | null;
  client: { name: string; email: string | null };
  lineItems: EditorLineItem[];
  totals: Record<string, string>;
}

function formatMinor(totalMinor: string, currency: string): string {
  return `${currency} ${(Number(totalMinor) / 100).toFixed(2)}`;
}

export function ProposalEditor({ initial }: { initial: EditorInitialData }) {
  const router = useRouter();
  const [coverNote, setCoverNote] = useState(initial.coverNote ?? "");
  const [validUntil, setValidUntil] = useState(initial.validUntil?.slice(0, 10) ?? "");
  const [lineItems, setLineItems] = useState<EditorLineItem[]>(
    initial.lineItems.length ? initial.lineItems : [{ description: "", qty: 1, unitPrice: 0, currency: "INR" }],
  );
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ publicUrl: string; emailed: boolean } | null>(null);

  const isDraft = initial.status === "draft";

  function updateItem(i: number, patch: Partial<EditorLineItem>) {
    setLineItems((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setLineItems((items) => [...items, { description: "", qty: 1, unitPrice: 0, currency: "INR" }]);
  }

  function removeItem(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

  async function generateWithAI() {
    setBusy(true);
    const res = await fetch(`/api/proposals/${initial.id}/ai-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't generate a draft.");
      return;
    }
    setCoverNote(data.draft.coverNote);
    if (data.draft.lineItems.length > 0) setLineItems(data.draft.lineItems);
    toast("AI draft inserted — review and edit before saving.");
  }

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/proposals/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverNote, validUntil: validUntil || null, lineItems }),
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
    const res = await fetch(`/api/proposals/${initial.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't send.");
      return;
    }
    setSentInfo({ publicUrl: data.publicUrl, emailed: data.emailed });
    router.refresh();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Proposal</h1>
          <p className="text-sm text-muted-foreground">
            {initial.client.name} {initial.client.email ? `<${initial.client.email}>` : ""}
          </p>
        </div>
        <Badge variant={isDraft ? "secondary" : "default"} className="capitalize">
          {initial.status}
        </Badge>
      </div>

      {isDraft && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 pt-6">
            <Input
              placeholder="Short brief, e.g. '3-page website redesign, $1,500, 3-week timeline'"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={generateWithAI} disabled={busy || !brief.trim()}>
              Generate with AI
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cover note</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} disabled={!isDraft} rows={4} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                      disabled={!isDraft}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-16"
                      value={item.qty}
                      onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                      disabled={!isDraft}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-24"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                      disabled={!isDraft}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.currency}
                      onValueChange={(v) => updateItem(i, { currency: v })}
                      disabled={!isDraft}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {isDraft && lineItems.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeItem(i)}>
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isDraft && (
            <Button variant="outline" size="sm" className="self-start" onClick={addItem}>
              + Add line
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 font-mono text-sm">
            {Object.entries(initial.totals).map(([currency, minor]) => (
              <li key={currency}>{formatMinor(minor, currency)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="validUntil">
            Valid until
          </label>
          <Input
            id="validUntil"
            type="date"
            className="w-40"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={!isDraft}
          />
        </div>
      </div>

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

      {sentInfo && (
        <p className="text-sm text-muted-foreground">
          Sent. {sentInfo.emailed ? "Emailed to the client." : "Email not configured — share this link manually:"}{" "}
          <a href={sentInfo.publicUrl} className="text-accent-foreground hover:underline">
            {sentInfo.publicUrl}
          </a>
        </p>
      )}
    </div>
  );
}
