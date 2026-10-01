/**
 * Client Portal (PRD §13) — one magic-link page per engagement, no login.
 * Pure read-aggregation via services/portal; never a separate source of
 * truth about Engagement.stage. Mobile-first, <2s load target
 * (System Design §7).
 *
 * Scaffold placeholder — the [engagementId] segment is the magic-link
 * token in v1 (replace with a signed/opaque token before shipping, not a
 * raw database id).
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  return (
    <main>
      <h1>Project status</h1>
      <p>Engagement: {engagementId}</p>
    </main>
  );
}
