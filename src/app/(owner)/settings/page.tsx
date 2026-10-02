/**
 * Tenant-level settings (PRD §15): business profile, team members,
 * Razorpay connection, WhatsApp Business connection, default templates
 * and follow-up cadence. Only the business-profile slice is built so far
 * (needed to unblock PRD §6's GST computation) — the rest is a later
 * iteration.
 */
import { getSession, requireTenantContext } from "@/lib/auth";
import { getTenantSettings } from "@/services/settings";
import { getFollowUpRules } from "@/services/followup";
import { BusinessProfileForm } from "./business-profile-form";
import { FollowupRulesForm } from "./followup-rules-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const ctx = requireTenantContext(session);
  const settings = await getTenantSettings(ctx);
  const followUpRules = await getFollowUpRules(ctx);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Settings</h1>
      <BusinessProfileForm initial={settings} />
      <h2>Follow-up cadence</h2>
      <FollowupRulesForm initial={followUpRules} />
    </main>
  );
}
