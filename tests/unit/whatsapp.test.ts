import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.WHATSAPP_PROVIDER_API_KEY = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("sendWhatsAppMessage", () => {
  it("throws without sending when WHATSAPP_PROVIDER_API_KEY is not set", async () => {
    delete process.env.WHATSAPP_PROVIDER_API_KEY;

    await expect(
      sendWhatsAppMessage({ tenantId: "t1", toPhone: "+91 8248166858", templateName: "proposal_ready", templateParams: [] }),
    ).rejects.toThrow(/not set/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes the phone number to digits only and posts a template message", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, text: async () => "{}" });

    await sendWhatsAppMessage({
      tenantId: "t1",
      toPhone: "+91 8248-166858",
      templateName: "proposal_ready",
      templateParams: ["Asha", "https://flowdesk.app/p/abc"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain("/123456/messages");
    const body = JSON.parse(options.body);
    expect(body.to).toBe("918248166858");
    expect(body.template.name).toBe("proposal_ready");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "Asha" },
      { type: "text", text: "https://flowdesk.app/p/abc" },
    ]);
  });

  it("throws with the response body when Meta rejects the send", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"Template not approved"}}',
    });

    await expect(
      sendWhatsAppMessage({ tenantId: "t1", toPhone: "918248166858", templateName: "proposal_ready", templateParams: [] }),
    ).rejects.toThrow(/template not approved/i);
  });
});
