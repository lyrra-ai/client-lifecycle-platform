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
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: configured ? "green" : "#999" }}>{configured ? "●" : "○"}</span>{" "}
      {label} — {configured ? "connected" : "not configured"}
    </div>
  );
}

export function IntegrationsStatus({ status }: { status: IntegrationStatus }) {
  return (
    <div style={{ maxWidth: 400, marginBottom: 24 }}>
      <StatusRow label="Razorpay" configured={status.razorpayConfigured} />
      <StatusRow label="WhatsApp" configured={status.whatsappConfigured} />
      <StatusRow label="Email" configured={status.emailConfigured} />
      <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
        These are set up once for the whole platform via environment variables, not per account —
        contact support to change them.
      </p>
    </div>
  );
}
