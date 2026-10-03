/**
 * Read-only — v1 has no per-tenant Razorpay/WhatsApp credential entry (see
 * src/services/settings/index.ts docstring for why). This just reports
 * whether the platform-wide env vars are configured, so the owner can tell
 * "is this connected" without digging into env files.
 */
export interface IntegrationStatus {
  razorpayConfigured: boolean;
  whatsappConfigured: boolean;
  emailConfigured: boolean;
}

function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${configured ? "bg-success" : "bg-soft"}`} />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{configured ? "connected" : "not configured"}</span>
    </div>
  );
}

export function IntegrationsStatus({ status }: { status: IntegrationStatus }) {
  return (
    <div className="flex flex-col gap-2">
      <StatusRow label="Razorpay" configured={status.razorpayConfigured} />
      <StatusRow label="WhatsApp" configured={status.whatsappConfigured} />
      <StatusRow label="Email" configured={status.emailConfigured} />
      <p className="mt-1 text-xs text-muted-foreground">
        These are set up once for the whole platform via environment variables, not per account —
        contact support to change them.
      </p>
    </div>
  );
}
