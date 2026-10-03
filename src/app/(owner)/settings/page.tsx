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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-3xl">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm initial={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification channel</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationChannelForm initial={settings.notificationChannel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationsStatus status={integrationStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamMembersPanel initial={teamMembers} currentUserId={session.userId} isOwner={session.role === "owner"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up cadence</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowupRulesForm initial={followUpRules} />
        </CardContent>
      </Card>
    </div>
  );
}
