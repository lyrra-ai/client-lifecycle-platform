/**
 * Lead list (PRD §3) — simple list sorted by most recent, not a kanban
 * pipeline (deliberately lightweight, not a CRM).
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { listLeads } from "@/services/engagement/leads";
import { NewLeadForm } from "./new-lead-form";
import { LeadRow } from "./lead-row";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) return null; // (owner) layout already redirects; satisfies TS

  const leads = await listLeads(requireTenantContext(session));

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Leads</h1>
      <NewLeadForm />
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">Name</th>
            <th align="left">Company</th>
            <th align="left">Source</th>
            <th align="left">Age</th>
            <th align="left">Status</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
      {leads.length === 0 && <p>No leads yet.</p>}
    </main>
  );
}
