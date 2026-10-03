/**
 * Lead list (PRD §3) — simple list sorted by most recent, not a kanban
 * pipeline (deliberately lightweight, not a CRM).
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { listLeads } from "@/services/engagement/leads";
import { NewLeadForm } from "./new-lead-form";
import { LeadRow } from "./lead-row";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) return null; // (owner) layout already redirects; satisfies TS

  const leads = await listLeads(requireTenantContext(session));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-3xl">Leads</h1>
      <NewLeadForm />
      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={{
                  id: lead.id,
                  status: lead.status,
                  source: lead.source,
                  createdAt: lead.createdAt.toISOString(),
                  client: lead.client ? { name: lead.client.name, company: lead.client.company } : null,
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
