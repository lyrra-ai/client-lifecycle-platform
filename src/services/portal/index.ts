/**
 * Portal Service (System Design §2) — read-only aggregation across every
 * entity tied to one Engagement, for the client-facing portal (PRD §13).
 * Creates no new data of its own and talks to nothing external — a live
 * read, never a periodically-regenerated snapshot. Every linked artifact
 * points at the public page that already owns it (/p, /i, /w, /intake,
 * /access, /kickoff) rather than duplicating that content here.
 */
import { prisma } from "@/lib/db";
import { AUTOMATIC_NEXT_STAGE } from "@/services/engagement";
import type { EngagementStage } from "@prisma/client";

// Walks the state machine from "lead" to build the full ordered timeline
// (System Design §3.1) — a single source of truth shared with the actual
// stage-transition logic, so the portal can never drift out of sync with it.
function fullStageOrder(): EngagementStage[] {
  const order: EngagementStage[] = ["lead"];
  let current: EngagementStage = "lead";
  while (AUTOMATIC_NEXT_STAGE[current]) {
    current = AUTOMATIC_NEXT_STAGE[current]!;
    order.push(current);
  }
  return order;
}

export interface PortalTodoItem {
  label: string;
  href: string;
}

export async function getPortalData(token: string) {
  const engagement = await prisma.engagement.findUniqueOrThrow({
    where: { publicToken: token },
    include: {
      client: true,
      tenant: true,
      proposals: { orderBy: { version: "desc" }, take: 1 },
      invoices: { orderBy: { createdAt: "asc" } },
      welcomeDocs: true,
      intakeForms: { include: { responses: true } },
      accessRequests: true,
      kickoffCalls: { include: { summary: true } },
    },
  });

  const latestProposal = engagement.proposals[0] ?? null;
  const welcomeDoc = engagement.welcomeDocs[0] ?? null;
  const intakeForm = engagement.intakeForms[0] ?? null;
  const kickoffCall = engagement.kickoffCalls[0] ?? null;

  const todo: PortalTodoItem[] = [];
  if (latestProposal && (latestProposal.status === "sent" || latestProposal.status === "viewed")) {
    todo.push({ label: "Review and sign your proposal", href: `/p/${latestProposal.publicToken}` });
  }
  for (const invoice of engagement.invoices) {
    if (invoice.status === "sent") {
      todo.push({ label: `Pay invoice (${invoice.currency} ${(Number(invoice.amountMinor) / 100).toFixed(2)})`, href: `/i/${invoice.publicToken}` });
    }
  }
  if (intakeForm && intakeForm.status === "sent" && intakeForm.responses.length === 0) {
    todo.push({ label: "Fill out the intake form", href: `/intake/${intakeForm.publicToken}` });
  }
  const openAccessRequests = engagement.accessRequests.filter((r) => r.status === "requested");
  if (openAccessRequests.length > 0) {
    todo.push({ label: `Grant access to ${openAccessRequests.length} platform(s)`, href: `/access/${engagement.publicToken}` });
  }
  if (kickoffCall && !kickoffCall.scheduledAt && kickoffCall.status === "scheduled") {
    todo.push({ label: "Pick a kickoff call time", href: `/kickoff/${kickoffCall.publicToken}` });
  }

  return {
    businessName: engagement.tenant.businessName,
    clientName: engagement.client.name,
    currentStage: engagement.stage,
    timeline: fullStageOrder(),
    todo,
    proposal: latestProposal
      ? { id: latestProposal.publicToken, version: latestProposal.version, status: latestProposal.status, href: `/p/${latestProposal.publicToken}` }
      : null,
    invoices: engagement.invoices.map((i) => ({
      id: i.publicToken,
      type: i.type,
      amount: Number(i.amountMinor) / 100,
      currency: i.currency,
      status: i.status,
      href: `/i/${i.publicToken}`,
    })),
    welcomeDoc: welcomeDoc && welcomeDoc.status === "sent" ? { id: welcomeDoc.publicToken, href: `/w/${welcomeDoc.publicToken}` } : null,
    intakeForm:
      intakeForm && intakeForm.status === "sent"
        ? { id: intakeForm.publicToken, href: `/intake/${intakeForm.publicToken}`, submitted: intakeForm.responses.length > 0 }
        : null,
    accessRequests:
      engagement.accessRequests.length > 0
        ? {
            href: `/access/${engagement.publicToken}`,
            granted: engagement.accessRequests.filter((r) => r.status === "granted").length,
            total: engagement.accessRequests.length,
          }
        : null,
    kickoffCall: kickoffCall
      ? {
          id: kickoffCall.publicToken,
          href: `/kickoff/${kickoffCall.publicToken}`,
          status: kickoffCall.status,
          scheduledAt: kickoffCall.scheduledAt?.toISOString() ?? null,
          hasSummary: Boolean(kickoffCall.summary),
        }
      : null,
  };
}
