import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/integrations/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/integrations/whatsapp", () => ({ sendWhatsAppMessage: vi.fn() }));

const baseParams = {
  tenantId: "t1",
  clientPhone: "+91 8248166858",
  clientEmail: "client@example.com",
  whatsapp: { templateName: "proposal_ready", templateParams: ["Asha", "https://flowdesk.app/p/abc"] },
  email: { subject: "Your proposal is ready", html: "<p>view it</p>" },
  devLabel: "proposal link",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notifyClient", () => {
  it("sends WhatsApp only when channelPreference is whatsapp_first and it succeeds", async () => {
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const { sendEmail } = await import("@/lib/integrations/email");
    const { notifyClient } = await import("@/lib/integrations/notify");

    const result = await notifyClient({ ...baseParams, channelPreference: "whatsapp_first" });

    expect(result).toEqual({ whatsapped: true, emailed: false });
    expect(sendWhatsAppMessage).toHaveBeenCalledWith({
      tenantId: "t1",
      toPhone: "+91 8248166858",
      templateName: "proposal_ready",
      templateParams: ["Asha", "https://flowdesk.app/p/abc"],
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends email only when channelPreference is email_first and it succeeds", async () => {
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const { sendEmail } = await import("@/lib/integrations/email");
    const { notifyClient } = await import("@/lib/integrations/notify");

    const result = await notifyClient({ ...baseParams, channelPreference: "email_first" });

    expect(result).toEqual({ whatsapped: false, emailed: true });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("falls back to email when whatsapp_first but the client has no phone on file", async () => {
    const { sendEmail } = await import("@/lib/integrations/email");
    const { notifyClient } = await import("@/lib/integrations/notify");

    const result = await notifyClient({ ...baseParams, channelPreference: "whatsapp_first", clientPhone: null });

    expect(result).toEqual({ whatsapped: false, emailed: true });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("falls back to email when whatsapp_first but the WhatsApp send throws in dev", async () => {
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const { sendEmail } = await import("@/lib/integrations/email");
    const { notifyClient } = await import("@/lib/integrations/notify");
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("template not approved"));

    const result = await notifyClient({ ...baseParams, channelPreference: "whatsapp_first" });

    expect(result).toEqual({ whatsapped: false, emailed: true });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("falls back to WhatsApp when email_first but the client has no email on file", async () => {
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const { notifyClient } = await import("@/lib/integrations/notify");

    const result = await notifyClient({ ...baseParams, channelPreference: "email_first", clientEmail: null });

    expect(result).toEqual({ whatsapped: true, emailed: false });
    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
  });

  it("returns both false when neither channel is reachable", async () => {
    const { notifyClient } = await import("@/lib/integrations/notify");

    const result = await notifyClient({
      ...baseParams,
      channelPreference: "email_first",
      clientEmail: null,
      clientPhone: null,
    });

    expect(result).toEqual({ whatsapped: false, emailed: false });
  });

  it("rethrows a preferred-channel provider error in production instead of falling back", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { sendWhatsAppMessage } = await import("@/lib/integrations/whatsapp");
    const { sendEmail } = await import("@/lib/integrations/email");
    const { notifyClient } = await import("@/lib/integrations/notify");
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("provider down"));

    await expect(notifyClient({ ...baseParams, channelPreference: "whatsapp_first" })).rejects.toThrow("provider down");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
