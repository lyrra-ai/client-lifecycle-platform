import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";

const VERIFY_TOKEN = "test-verify-token";
const APP_SECRET = "test-app-secret";

beforeEach(() => {
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function signedRequest(body: object): NextRequest {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
  return new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": signature, "content-type": "application/json" },
    body: raw,
  });
}

describe("GET /api/webhooks/whatsapp (verification handshake)", () => {
  it("echoes hub.challenge when mode is subscribe and the token matches", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
    );

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("refuses when the verify token doesn't match", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`,
    );

    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("refuses when hub.mode isn't subscribe", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
    );

    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp (event delivery)", () => {
  it("accepts a correctly signed payload", async () => {
    const req = signedRequest({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered", recipient_id: "918248166858" }] } }] }],
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("accepts a payload with inbound messages", async () => {
    const req = signedRequest({
      entry: [{ changes: [{ value: { messages: [{ from: "918248166858", type: "text", text: { body: "hi" } }] } }] }],
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it("rejects a missing signature", async () => {
    const raw = JSON.stringify({ entry: [] });
    const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      body: raw,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const raw = JSON.stringify({ entry: [] });
    const badSignature = `sha256=${createHmac("sha256", "wrong-secret").update(raw).digest("hex")}`;
    const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": badSignature },
      body: raw,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("rejects a tampered body that no longer matches its signature", async () => {
    const original = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }] };
    const req = signedRequest(original);
    // Re-wrap with a tampered body but the original (now-stale) signature header.
    const tamperedBody = JSON.stringify({ entry: [] });
    const tamperedReq = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": req.headers.get("x-hub-signature-256")! },
      body: tamperedBody,
    });

    const res = await POST(tamperedReq);

    expect(res.status).toBe(400);
  });
});
