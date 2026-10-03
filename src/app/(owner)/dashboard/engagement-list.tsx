"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DashboardEngagementRow {
  id: string;
  clientName: string;
  stage: string;
  currency: string;
  updatedAt: string;
}

const ALL_STAGES = "__all__";

export function EngagementList({ engagements }: { engagements: DashboardEngagementRow[] }) {
  const [stageFilter, setStageFilter] = useState(ALL_STAGES);
  const stages = Array.from(new Set(engagements.map((e) => e.stage))).sort();
  const visible = stageFilter === ALL_STAGES ? engagements : engagements.filter((e) => e.stage === stageFilter);

  return (
    <div className="flex flex-col gap-3">
      <Select value={stageFilter} onValueChange={setStageFilter}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All stages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STAGES}>All stages</SelectItem>
          {stages.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No engagements{stageFilter !== ALL_STAGES ? ` at ${stageFilter}` : ""}.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.clientName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.stage.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(e.updatedAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/engagements/${e.id}`} className="text-accent-foreground hover:underline">
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
