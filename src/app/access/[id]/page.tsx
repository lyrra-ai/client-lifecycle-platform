/**
 * Public, no-login access-request checklist (PRD §10) — one consolidated
 * page per engagement rather than a wall of separate emails.
 */
import { getPublicAccessChecklist } from "@/services/onboarding";
import { ChecklistItem } from "./checklist-item";
import { PublicShell } from "@/components/public-shell";

export default async function PublicAccessChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const checklist = await getPublicAccessChecklist(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{checklist.businessName}</h1>
          <p className="text-sm text-muted-foreground">A few things we need access to, {checklist.clientName}.</p>
        </div>
        <div className="flex flex-col gap-4">
          {checklist.requests.map((r) => (
            <ChecklistItem key={r.id} item={r} />
          ))}
          {checklist.requests.length === 0 && <p className="text-sm text-muted-foreground">Nothing needed yet.</p>}
        </div>
      </div>
    </PublicShell>
  );
}
