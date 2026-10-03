"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "team_member";
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
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
  const [busy, setBusy] = useState(false);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/settings/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't add team member.");
      return;
    }
    setMembers((ms) => [...ms, data.member]);
    setName("");
    setEmail("");
    toast(`Added ${data.member.name}. They can log in with ${data.member.email} using the usual email code.`);
  }

  async function removeMember(id: string) {
    setBusy(true);
    const res = await fetch(`/api/settings/team-members/${id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Couldn't remove team member.");
      return;
    }
    setMembers((ms) => ms.filter((m) => m.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-sm">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{m.name}</span>
            <span className="text-muted-foreground">{m.email}</span>
            <Badge variant="secondary">{m.role.replace(/_/g, " ")}</Badge>
            {m.id === currentUserId && <span className="text-muted-foreground">(you)</span>}
            {isOwner && m.id !== currentUserId && (
              <Button size="sm" variant="ghost" onClick={() => removeMember(m.id)} disabled={busy} className="ml-auto">
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={addMember} className="flex flex-wrap items-center gap-2">
          <Input className="w-40" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="w-56" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="sm" disabled={busy}>
            Add team member
          </Button>
        </form>
      )}
    </div>
  );
}
