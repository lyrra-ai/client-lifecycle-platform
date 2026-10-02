import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";

vi.mock("@/lib/ai-gateway", () => ({
  AIGateway: { generate: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAccessRequests", () => {
  it("uses the static template for a known platform, interpolating the owner's email", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    await prisma.user.create({ data: { tenantId: tenant.id, name: "Owner", email: "owner@agency.com", role: "owner" } });
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests } = await import("@/services/onboarding");

    const [request] = await createAccessRequests(ctx, engagement.id, ["Google Analytics"]);

    expect(request!.instructions).toContain("owner@agency.com");
    expect(request!.status).toBe("requested");
  });

  it("falls through to the AI Gateway for a platform not in the static library", async () => {
    const { AIGateway } = await import("@/lib/ai-gateway");
    (AIGateway.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      draft: "1. Go to Settings > Team.\n2. Add the agency's email.",
      modelUsed: "m", tokensUsed: 1, costEstimate: 0,
    });
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests } = await import("@/services/onboarding");

    const [request] = await createAccessRequests(ctx, engagement.id, ["SomeNicheTool"]);

    expect(request!.instructions).toContain("Settings > Team");
    expect(AIGateway.generate).toHaveBeenCalledWith(expect.objectContaining({ task: "access_instructions" }));
  });

  it("creates one request per platform in a single call", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests } = await import("@/services/onboarding");

    const requests = await createAccessRequests(ctx, engagement.id, [
      "Google Analytics", "Google Ads", "WordPress",
    ]);

    expect(requests).toHaveLength(3);
  });

  it("uses instruction-only fallback text for a platform with no invite flow", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests } = await import("@/services/onboarding");

    const [request] = await createAccessRequests(ctx, engagement.id, ["Domain Registrar"]);

    expect(request!.instructions).toMatch(/don't support adding a collaborator/i);
  });
});

describe("setAccessRequestStatus", () => {
  it("marks a request granted and stamps grantedAt", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, setAccessRequestStatus } = await import("@/services/onboarding");
    const [request] = await createAccessRequests(ctx, engagement.id, ["WordPress"]);

    const updated = await setAccessRequestStatus(ctx, request!.id, "granted");

    expect(updated.status).toBe("granted");
    expect(updated.grantedAt).not.toBeNull();
  });

  it("marks a request n/a", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, setAccessRequestStatus } = await import("@/services/onboarding");
    const [request] = await createAccessRequests(ctx, engagement.id, ["WordPress"]);

    const updated = await setAccessRequestStatus(ctx, request!.id, "na");

    expect(updated.status).toBe("na");
  });
});

describe("clientMarkAccessRequestGranted", () => {
  it("rejects a note that looks like a credential, without persisting anything (System Design §4)", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, clientMarkAccessRequestGranted } = await import("@/services/onboarding");
    const [request] = await createAccessRequests(ctx, engagement.id, ["WordPress"]);

    await expect(
      clientMarkAccessRequestGranted(request!.id, "my password is hunter2"),
    ).rejects.toThrow(/password or login/i);

    const unchanged = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request!.id } });
    expect(unchanged.status).toBe("requested");
  });

  it("marks a request granted on a clean note", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, clientMarkAccessRequestGranted } = await import("@/services/onboarding");
    const [request] = await createAccessRequests(ctx, engagement.id, ["WordPress"]);

    const updated = await clientMarkAccessRequestGranted(request!.id, "Added you as admin");

    expect(updated.status).toBe("granted");
  });

  it("refuses to re-mark an already-updated request", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, clientMarkAccessRequestGranted } = await import("@/services/onboarding");
    const [request] = await createAccessRequests(ctx, engagement.id, ["WordPress"]);
    await clientMarkAccessRequestGranted(request!.id);

    await expect(clientMarkAccessRequestGranted(request!.id)).rejects.toThrow(/already been updated/i);
  });
});

describe("getPublicAccessChecklist", () => {
  it("lists every request for the engagement with business/client names", async () => {
    const { ctx, tenant } = await createTenant("Checklist Co");
    const client = await createClient(tenant.id, { name: "Checklist Client" });
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { createAccessRequests, getPublicAccessChecklist } = await import("@/services/onboarding");
    await createAccessRequests(ctx, engagement.id, ["Google Analytics", "Shopify"]);

    const checklist = await getPublicAccessChecklist(engagement.publicToken);

    expect(checklist.businessName).toBe("Checklist Co");
    expect(checklist.clientName).toBe("Checklist Client");
    expect(checklist.requests).toHaveLength(2);
  });
});
