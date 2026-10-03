"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AccessRequestRow {
  id: string;
  platform: string;
  status: string;
}

export function AccessRequestList({
  engagementId,
  engagementPublicToken,
  platformLibrary,
  requests,
}: {
  engagementId: string;
  engagementPublicToken: string;
  platformLibrary: string[];
  requests: AccessRequestRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [customPlatform, setCustomPlatform] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(name: string) {
    setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));
  }

  async function requestAccess() {
    const platforms = [...selected, ...(customPlatform.trim() ? [customPlatform.trim()] : [])];
    if (platforms.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${engagementId}/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't create access requests.");
      return;
    }
    setSelected([]);
    setCustomPlatform("");
    setOpen(false);
    router.refresh();
  }

  async function setStatus(id: string, status: "granted" | "na") {
    setBusy(true);
    await fetch(`/api/access-requests/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.platform}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.status}</Badge>
                </TableCell>
                <TableCell className="flex gap-2">
                  {r.status === "requested" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "granted")} disabled={busy}>
                        Mark granted
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "na")} disabled={busy}>
                        N/A
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {requests.length > 0 && (
        <a href={`/access/${engagementPublicToken}`} className="text-sm text-accent-foreground hover:underline">
          View client checklist link
        </a>
      )}

      {!open ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
          + Request access
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col gap-2">
            {platformLibrary.map((name) => (
              <Label key={name} className="flex items-center gap-2">
                <Checkbox checked={selected.includes(name)} onCheckedChange={() => toggle(name)} />
                {name}
              </Label>
            ))}
          </div>
          <Input
            placeholder="Other platform…"
            value={customPlatform}
            onChange={(e) => setCustomPlatform(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={requestAccess} disabled={busy}>
              Request access
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
