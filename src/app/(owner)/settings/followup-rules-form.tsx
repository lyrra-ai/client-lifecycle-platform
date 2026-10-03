"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface RuleRow {
  targetType: string;
  nudgeDaysAfter: number[];
  maxNudges: number;
}

const LABELS: Record<string, string> = {
  proposal: "Proposals",
  invoice: "Invoices",
  intake_form: "Intake forms",
  access_request: "Access requests",
  feedback_request: "Feedback requests",
};

export function FollowupRulesForm({ initial }: { initial: RuleRow[] }) {
  const [rules, setRules] = useState(initial.map((r) => ({ ...r, daysText: r.nudgeDaysAfter.join(", ") })));
  const [busy, setBusy] = useState(false);

  async function save(index: number) {
    const rule = rules[index]!;
    setBusy(true);
    const nudgeDaysAfter = rule.daysText.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
    const res = await fetch("/api/settings/followup-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: rule.targetType, nudgeDaysAfter, maxNudges: rule.maxNudges }),
    });
    setBusy(false);
    toast(res.ok ? `Saved ${LABELS[rule.targetType]}.` : "Couldn't save.");
  }

  function update(index: number, patch: Partial<{ daysText: string; maxNudges: number }>) {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule, i) => (
        <div key={rule.targetType} className="flex flex-wrap items-end gap-3">
          <span className="w-36 text-sm font-medium">{LABELS[rule.targetType]}</span>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Nudge days</Label>
            <Input
              placeholder="2, 5, 9"
              value={rule.daysText}
              onChange={(e) => update(i, { daysText: e.target.value })}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Max nudges</Label>
            <Input
              type="number"
              value={rule.maxNudges}
              onChange={(e) => update(i, { maxNudges: Number(e.target.value) })}
              className="w-20"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => save(i)} disabled={busy}>
            Save
          </Button>
        </div>
      ))}
    </div>
  );
}
