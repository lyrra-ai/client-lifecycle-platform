"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export interface InvoiceRow {
  id: string;
  type: string;
  amount: number;
  currency: string;
  gstApplicable: boolean;
  status: string;
  dueDate: string | null;
}

export function InvoiceList({ engagementId, invoices }: { engagementId: string; invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("milestone");
  const [amountMajor, setAmountMajor] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${engagementId}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amountMajor, currency, gstApplicable }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't create invoice.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="capitalize">{inv.type}</TableCell>
                <TableCell className="font-mono">
                  {inv.currency} {inv.amount.toFixed(2)}
                </TableCell>
                <TableCell>{inv.gstApplicable ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/invoices/${inv.id}`} className="text-accent-foreground hover:underline">
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!open ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
          + Add milestone/final invoice
        </Button>
      ) : (
        <form onSubmit={addInvoice} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                className="w-32"
                value={amountMajor}
                onChange={(e) => setAmountMajor(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Label className="flex items-center gap-2 pb-2">
              <Checkbox checked={gstApplicable} onCheckedChange={(v) => setGstApplicable(Boolean(v))} />
              GST applicable
            </Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Create
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
