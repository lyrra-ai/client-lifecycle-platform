import { describe, it, expect } from "vitest";
import { createTenant } from "../helpers/factories";
import { captureLead, listLeads, markLeadLost, createEngagementFromLead } from "@/services/engagement/leads";

describe("captureLead", () => {
  it("creates a new Client + Lead when no contact matches (PRD §3)", async () => {
    const { ctx } = await createTenant();

    const result = await captureLead(ctx, {
      name: "Riya Shah",
      email: "riya@shahinteriors.com",
      source: "manual",
    });

    expect(result.matchedExistingClient).toBe(false);
    expect(result.lead.status).toBe("new");
    expect(result.client.name).toBe("Riya Shah");
  });

  it("links to the existing Client on a matching email instead of duplicating it (PRD §3 edge case)", async () => {
    const { ctx } = await createTenant();
    const first = await captureLead(ctx, { name: "Riya Shah", email: "riya@shahinteriors.com", source: "manual" });

    const second = await captureLead(ctx, { name: "Riya S.", email: "riya@shahinteriors.com", source: "manual" });

    expect(second.matchedExistingClient).toBe(true);
    expect(second.client.id).toBe(first.client.id);
  });

  it("links to the existing Client on a matching phone when email differs", async () => {
    const { ctx } = await createTenant();
    const first = await captureLead(ctx, { name: "Dev Patel", phone: "+919876543210", source: "manual" });

    const second = await captureLead(ctx, { name: "Dev P.", phone: "+919876543210", email: "dev@new.com", source: "manual" });

    expect(second.matchedExistingClient).toBe(true);
    expect(second.client.id).toBe(first.client.id);
  });

  it("never duplicates a Client across two different tenants with the same email (multi-tenancy, System Design §1)", async () => {
    const { ctx: ctxA } = await createTenant("Tenant A");
    const { ctx: ctxB } = await createTenant("Tenant B");

    const a = await captureLead(ctxA, { name: "Shared Email", email: "shared@example.com", source: "manual" });
    const b = await captureLead(ctxB, { name: "Shared Email", email: "shared@example.com", source: "manual" });

    expect(a.client.id).not.toBe(b.client.id);
  });
});

describe("listLeads", () => {
  it("only returns leads scoped to the calling tenant", async () => {
    const { ctx: ctxA } = await createTenant("Tenant A");
    const { ctx: ctxB } = await createTenant("Tenant B");
    await captureLead(ctxA, { name: "A's Lead", source: "manual" });
    await captureLead(ctxB, { name: "B's Lead", source: "manual" });

    const leadsForA = await listLeads(ctxA);

    expect(leadsForA).toHaveLength(1);
    expect(leadsForA[0]!.client?.name).toBe("A's Lead");
  });
});

describe("markLeadLost", () => {
  it("sets status to lost without deleting the record (PRD §3: never auto-archived)", async () => {
    const { ctx } = await createTenant();
    const { lead } = await captureLead(ctx, { name: "Dead End", source: "manual" });

    const updated = await markLeadLost(ctx, lead.id);

    expect(updated.status).toBe("lost");
    const stillListed = await listLeads(ctx);
    expect(stillListed).toHaveLength(1);
  });
});

describe("createEngagementFromLead", () => {
  it("carries the lead's client forward with zero re-typing (PRD §3 acceptance criteria)", async () => {
    const { ctx, tenant } = await createTenant();
    const { lead, client } = await captureLead(ctx, {
      name: "Anita Rao",
      email: "anita@raodesigns.com",
      source: "manual",
    });

    const engagement = await createEngagementFromLead(ctx, lead.id);

    expect(engagement.clientId).toBe(client.id);
    expect(engagement.leadId).toBe(lead.id);
    expect(engagement.tenantId).toBe(tenant.id);
    expect(engagement.stage).toBe("lead");
  });

  it("defaults the engagement currency to the client's preferred currency", async () => {
    const { ctx } = await createTenant();
    const { lead } = await captureLead(ctx, { name: "USD Client", source: "manual" });

    const engagement = await createEngagementFromLead(ctx, lead.id);

    expect(engagement.currency).toBe("INR"); // tenant default when the client has none set
  });
});
