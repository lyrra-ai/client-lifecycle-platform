"use client";

import { useState } from "react";

export interface DashboardEngagementRow {
  id: string;
  clientName: string;
  stage: string;
  currency: string;
  updatedAt: string;
}

export function EngagementList({ engagements }: { engagements: DashboardEngagementRow[] }) {
  const [stageFilter, setStageFilter] = useState("");
  const stages = Array.from(new Set(engagements.map((e) => e.stage))).sort();
  const visible = stageFilter ? engagements.filter((e) => e.stage === stageFilter) : engagements;

  return (
    <div>
      <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
        <option value="">All stages</option>
        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th align="left">Client</th>
            <th align="left">Stage</th>
            <th align="left">Updated</th>
            <th align="left"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => (
            <tr key={e.id}>
              <td>{e.clientName}</td>
              <td>{e.stage}</td>
              <td>{new Date(e.updatedAt).toLocaleDateString()}</td>
              <td><a href={`/engagements/${e.id}`}>Open</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && <p>No engagements{stageFilter ? ` at ${stageFilter}` : ""}.</p>}
    </div>
  );
}
