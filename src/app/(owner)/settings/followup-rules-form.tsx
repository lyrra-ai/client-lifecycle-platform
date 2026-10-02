"use client";

import { useState } from "react";

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
};

export function FollowupRulesForm({ initial }: { initial: RuleRow[] }) {
  const [rules, setRules] = useState(initial.map((r) => ({ ...r, daysText: r.nudgeDaysAfter.join(", ") })));
  const [message, setMessage] = useState<string | null>(null);

  async function save(index: number) {
    const rule = rules[index]!;
    const nudgeDaysAfter = rule.daysText.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
    const res = await fetch("/api/settings/followup-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: rule.targetType, nudgeDaysAfter, maxNudges: rule.maxNudges }),
    });
    setMessage(res.ok ? `Saved ${LABELS[rule.targetType]}.` : "Couldn't save.");
  }

  function update(index: number, patch: Partial<{ daysText: string; maxNudges: number }>) {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      {rules.map((rule, i) => (
        <div key={rule.targetType} style={{ marginBottom: 12 }}>
          <strong>{LABELS[rule.targetType]}</strong>{" "}
          <input
            placeholder="2, 5, 9"
            value={rule.daysText}
            onChange={(e) => update(i, { daysText: e.target.value })}
            style={{ width: 120 }}
          />{" "}
          max nudges:{" "}
          <input
            type="number"
            value={rule.maxNudges}
            onChange={(e) => update(i, { maxNudges: Number(e.target.value) })}
            style={{ width: 50 }}
          />{" "}
          <button onClick={() => save(i)}>Save</button>
        </div>
      ))}
      {message && <p>{message}</p>}
    </div>
  );
}
