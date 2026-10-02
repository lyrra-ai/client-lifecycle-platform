import { describe, it, expect } from "vitest";
import { createTenant, createClient, createEngagement } from "../helpers/factories";
import { prisma } from "@/lib/db";
import { generatePublicToken } from "@/lib/public-token";
import { getOrCreateDraftProposal, updateDraftProposal, sendProposal } from "@/services/proposal";

describe("getPortalData", () => {
  it("includes the full lifecycle timeline with the current stage present", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.timeline).toContain("lead");
    expect(data.timeline).toContain("closed");
    expect(data.timeline.indexOf("onboarding")).toBeGreaterThan(data.timeline.indexOf("lead"));
    expect(data.currentStage).toBe("onboarding");
  });

  it("surfaces a sent proposal as both a document and a to-do item", async () => {
    const { ctx, tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await updateDraftProposal(ctx, draft.id, { lineItems: [{ description: "x", qty: 1, unitPrice: 100, currency: "INR" }] });
    await sendProposal(ctx, draft.id);
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.proposal).toEqual({ id: draft.publicToken, version: 1, status: "sent", href: `/p/${draft.publicToken}` });
    expect(data.todo).toContainEqual({ label: "Review and sign your proposal", href: `/p/${draft.publicToken}` });
  });

  it("does not list an accepted proposal as a to-do item", async () => {
    const { tenant, ctx } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const draft = await getOrCreateDraftProposal(ctx, engagement.id);
    await updateDraftProposal(ctx, draft.id, { lineItems: [{ description: "x", qty: 1, unitPrice: 100, currency: "INR" }] });
    await sendProposal(ctx, draft.id);
    await prisma.proposal.update({ where: { id: draft.id }, data: { status: "accepted" } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.todo).not.toContainEqual(expect.objectContaining({ href: `/p/${draft.publicToken}` }));
  });

  it("lists a sent, unpaid invoice as a to-do item but not a paid one", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_invoiced");
    const invoice = await prisma.invoice.create({
      data: { engagementId: engagement.id, type: "deposit", amountMinor: 50000n, currency: "INR", status: "sent", publicToken: generatePublicToken() },
    });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.invoices).toHaveLength(1);
    expect(data.todo.some((t) => t.href === `/i/${invoice.publicToken}`)).toBe(true);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "paid" } });
    const afterPaid = await getPortalData(engagement.publicToken);
    expect(afterPaid.todo.some((t) => t.href === `/i/${invoice.publicToken}`)).toBe(false);
  });

  it("omits an unsent welcome doc/intake form from the documents list", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
    await prisma.welcomeDoc.create({ data: { engagementId: engagement.id, content: "Draft", status: "draft", publicToken: generatePublicToken() } });
    await prisma.intakeForm.create({ data: { engagementId: engagement.id, questions: [], status: "draft", publicToken: generatePublicToken() } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.welcomeDoc).toBeNull();
    expect(data.intakeForm).toBeNull();
  });

  it("shows a sent welcome doc and flags an unsubmitted intake form as a to-do", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
    const doc = await prisma.welcomeDoc.create({ data: { engagementId: engagement.id, content: "Welcome", status: "sent", publicToken: generatePublicToken() } });
    const form = await prisma.intakeForm.create({ data: { engagementId: engagement.id, questions: [], status: "sent", publicToken: generatePublicToken() } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.welcomeDoc).toEqual({ id: doc.publicToken, href: `/w/${doc.publicToken}` });
    expect(data.intakeForm).toEqual({ id: form.publicToken, href: `/intake/${form.publicToken}`, submitted: false });
    expect(data.todo.some((t) => t.href === `/intake/${form.publicToken}`)).toBe(true);
  });

  it("stops flagging the intake form as a to-do once a response exists", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "deposit_paid");
    const form = await prisma.intakeForm.create({ data: { engagementId: engagement.id, questions: [], status: "sent", publicToken: generatePublicToken() } });
    await prisma.intakeResponse.create({ data: { intakeFormId: form.id, answers: {} } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.intakeForm!.submitted).toBe(true);
    expect(data.todo.some((t) => t.href === `/intake/${form.publicToken}`)).toBe(false);
  });

  it("summarizes access-request progress and flags open ones as a to-do", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "onboarding");
    await prisma.accessRequest.create({ data: { engagementId: engagement.id, platform: "A", instructions: "x", status: "granted" } });
    await prisma.accessRequest.create({ data: { engagementId: engagement.id, platform: "B", instructions: "x", status: "requested" } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.accessRequests).toEqual({ href: `/access/${engagement.publicToken}`, granted: 1, total: 2 });
    expect(data.todo.some((t) => t.href === `/access/${engagement.publicToken}`)).toBe(true);
  });

  it("shows the kickoff call and its summary availability", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "kickoff_done");
    const call = await prisma.kickoffCall.create({
      data: { engagementId: engagement.id, status: "done", scheduledAt: new Date(), proposedSlots: [], publicToken: generatePublicToken() },
    });
    await prisma.callSummary.create({ data: { kickoffCallId: call.id, summaryText: "s", actionItems: [] } });
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.kickoffCall).toEqual({
      id: call.publicToken, href: `/kickoff/${call.publicToken}`, status: "done",
      scheduledAt: data.kickoffCall!.scheduledAt, hasSummary: true,
    });
  });

  it("returns an empty documents section for a brand-new engagement", async () => {
    const { tenant } = await createTenant();
    const client = await createClient(tenant.id);
    const engagement = await createEngagement(tenant.id, client.id, "lead");
    const { getPortalData } = await import("@/services/portal");

    const data = await getPortalData(engagement.publicToken);

    expect(data.proposal).toBeNull();
    expect(data.invoices).toEqual([]);
    expect(data.welcomeDoc).toBeNull();
    expect(data.intakeForm).toBeNull();
    expect(data.accessRequests).toBeNull();
    expect(data.kickoffCall).toBeNull();
    expect(data.todo).toEqual([]);
  });
});
