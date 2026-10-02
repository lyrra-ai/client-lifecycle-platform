/**
 * Public, no-login access-request checklist (PRD §10) — one consolidated
 * page per engagement rather than a wall of separate emails.
 */
import { getPublicAccessChecklist } from "@/services/onboarding";
import { ChecklistItem } from "./checklist-item";

export default async function PublicAccessChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const checklist = await getPublicAccessChecklist(id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{checklist.businessName}</h1>
      <p>A few things we need access to, {checklist.clientName}.</p>
      {checklist.requests.map((r) => (
        <ChecklistItem key={r.id} item={r} />
      ))}
      {checklist.requests.length === 0 && <p>Nothing needed yet.</p>}
    </main>
  );
}
