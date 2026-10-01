/**
 * Owner dashboard (PRD §15) — "what needs my attention today" without
 * opening any individual engagement:
 *   - "Needs Follow-up" list (§12), surfaced first
 *   - Engagement list, sortable/filterable by stage
 *   - Outstanding invoices total across all engagements
 *   - Recently completed actions activity feed
 *
 * Scaffold placeholder — wire to services/followup, services/engagement,
 * services/billing once auth/session is implemented.
 */
export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Needs Follow-up, Engagements, Outstanding Invoices — scaffold placeholder.</p>
    </main>
  );
}
