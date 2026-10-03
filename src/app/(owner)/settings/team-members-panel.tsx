"use client";

import { useState } from "react";

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "team_member";
}

export function TeamMembersPanel({
  initial,
  currentUserId,
  isOwner,
}: {
  initial: TeamMemberRow[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const [members, setMembers] = useState(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't add team member.");
      return;
    }
    setMembers((ms) => [...ms, data.member]);
    setName("");
    setEmail("");
    setMessage(`Added ${data.member.name}. They can log in with ${data.member.email} using the usual email code.`);
  }

  async function removeMember(id: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/settings/team-members/${id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't remove team member.");
      return;
    }
    setMembers((ms) => ms.filter((m) => m.id !== id));
  }

  return (
    <div style={{ maxWidth: 500, marginBottom: 24 }}>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {members.map((m) => (
          <li key={m.id} style={{ marginBottom: 6 }}>
            {m.name} &middot; {m.email} &middot; {m.role}
            {isOwner && m.id !== currentUserId && (
              <button onClick={() => removeMember(m.id)} disabled={busy} style={{ marginLeft: 8 }}>
                Remove
              </button>
            )}
            {m.id === currentUserId && <span style={{ marginLeft: 8, color: "#999" }}>(you)</span>}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={addMember} style={{ marginTop: 12 }}>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <button type="submit" disabled={busy}>Add team member</button>
        </form>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}
