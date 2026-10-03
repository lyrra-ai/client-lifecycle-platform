"use client";

/**
 * Business profile (PRD §15 slice) — GST number, state, default deposit %.
 * The minimum billing (PRD §6) needs to compute GST and pre-fill deposit
 * invoices; the rest of Settings (team, Razorpay/WhatsApp, templates) is
 * a separate, later iteration.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SettingsData {
  businessName: string;
  gstNumber: string | null;
  state: string | null;
  defaultDepositPercent: number;
  defaultCurrency: string;
}

export function BusinessProfileForm({ initial }: { initial: SettingsData }) {
  const [gstNumber, setGstNumber] = useState(initial.gstNumber ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const [defaultDepositPercent, setDefaultDepositPercent] = useState(initial.defaultDepositPercent);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gstNumber, state, defaultDepositPercent }),
    });
    setBusy(false);
    toast(res.ok ? "Saved." : "Couldn't save.");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {initial.businessName} · {initial.defaultCurrency}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gstNumber">GST number (leave blank if not registered)</Label>
        <Input id="gstNumber" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessState">Business state (needed to compute CGST/SGST vs IGST)</Label>
        <Input id="businessState" value={state} onChange={(e) => setState(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="depositPercent">Default deposit percentage</Label>
        <Input
          id="depositPercent"
          type="number"
          min={1}
          max={100}
          className="w-32"
          value={defaultDepositPercent}
          onChange={(e) => setDefaultDepositPercent(Number(e.target.value))}
        />
      </div>

      <Button type="submit" disabled={busy} className="self-start">
        Save
      </Button>
    </form>
  );
}
