/**
 * Tenant-level settings (PRD §15): business profile, notification channel
 * preference, team members, follow-up cadence, and read-only integration
 * status are built. A per-tenant Razorpay/WhatsApp credential entry form
 * and configurable templates/question-library seeds are NOT — see
 * src/services/settings/index.ts's docstring for why.
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { getTenantSettings, getIntegrationStatus, listTeamMembers } from "@/services/settings";
import { getFollowUpRules } from "@/services/followup";
import { BusinessProfileForm } from "./business-profile-form";
import { FollowupRulesForm } from "./followup-rules-form";
import { NotificationChannelForm } from "./notification-channel-form";
import { IntegrationsStatus } from "./integrations-status";
import { TeamMembersPanel } from "./team-members-panel";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const ctx = requireTenantContext(session);
  const [settings, followUpRules, integrationStatus, teamMembers] = await Promise.all([
    getTenantSettings(ctx),
    getFollowUpRules(ctx),
    getIntegrationStatus(ctx),
    listTeamMembers(ctx),
  ]);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Settings</h1>
      <BusinessProfileForm initial={settings} />

      <h2>Notification channel</h2>
      <NotificationChannelForm initial={settings.notificationChannel} />

      <h2>Integrations</h2>
      <IntegrationsStatus status={integrationStatus} />

      <h2>Team members</h2>
      <TeamMembersPanel initial={teamMembers} currentUserId={session.userId} isOwner={session.role === "owner"} />

      <h2>Follow-up cadence</h2>
      <FollowupRulesForm initial={followUpRules} />
    </main>
  );
}
