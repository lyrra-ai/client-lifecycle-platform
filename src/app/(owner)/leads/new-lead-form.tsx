"use client";

/**
 * "+ New Lead" quick-add (PRD §3) — 5 fields max, usable from the leads
 * list. A duplicate email/phone match is surfaced, never blocked.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company, email, phone, state, notes }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Couldn't create the lead.");
      return;
    }

    setNotice(
      data.matchedExistingClient
        ? `Linked to existing contact: ${data.client.name}.`
        : "Lead created.",
    );
    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setState("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => setOpen(true)}>+ New Lead</Button>
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-4">
      <Input className="w-40" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input className="w-40" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      <Input className="w-48" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input className="w-36" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input className="w-32" placeholder="State (for GST)" value={state} onChange={(e) => setState(e.target.value)} />
      <Input className="w-40" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" disabled={submitting}>
        Save
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
