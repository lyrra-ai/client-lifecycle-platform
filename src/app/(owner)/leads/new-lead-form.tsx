"use client";

/**
 * "+ New Lead" quick-add (PRD §3) — 5 fields max, usable from the leads
 * list. A duplicate email/phone match is surfaced, never blocked.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <div>
        <button onClick={() => setOpen(true)}>+ New Lead</button>
        {notice && <p>{notice}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="State (for GST)" value={state} onChange={(e) => setState(e.target.value)} />
      <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button type="submit" disabled={submitting}>Save</button>
      <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </form>
  );
}
