"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div>
      <h3>Access Requests</h3>
      {requests.length === 0 && <p>None yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Platform</th>
            <th align="left">Status</th>
            <th align="left"></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.platform}</td>
              <td>{r.status}</td>
              <td>
                {r.status === "requested" && (
                  <>
                    <button onClick={() => setStatus(r.id, "granted")} disabled={busy}>Mark granted</button>{" "}
                    <button onClick={() => setStatus(r.id, "na")} disabled={busy}>N/A</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {requests.length > 0 && (
        <p>
          <a href={`/access/${engagementPublicToken}`}>View client checklist link</a>
        </p>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)}>+ Request access</button>
      ) : (
        <div style={{ border: "1px solid #ccc", padding: 12, marginTop: 8 }}>
          {platformLibrary.map((name) => (
            <label key={name} style={{ display: "block" }}>
              <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
              {name}
            </label>
          ))}
          <input
            placeholder="Other platform..."
            value={customPlatform}
            onChange={(e) => setCustomPlatform(e.target.value)}
            style={{ display: "block", marginTop: 8 }}
          />
          <button onClick={requestAccess} disabled={busy} style={{ marginTop: 8 }}>Request access</button>{" "}
          <button onClick={() => setOpen(false)}>Cancel</button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
