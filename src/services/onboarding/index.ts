/**
 * Onboarding Service (System Design §2) — owns WelcomeDoc, IntakeForm,
 * IntakeResponse, AccessRequest. Talks to AIGateway and WhatsApp/Email.
 * Implements PRD §8 (Welcome Doc) and §9 (Intake Form) so far; §10
 * (Request for Access) is a later iteration.
 *
 * Hard boundary (System Design §4): never store or transmit a raw client
 * credential. AccessRequest.instructions is generated text only.
 */
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TenantContext, withTenant } from "@/lib/tenant";
import type { Prisma } from "@prisma/client";
import { AIGateway } from "@/lib/ai-gateway";
import { advanceStageAutomatically } from "@/services/engagement";
import { notifyClient } from "@/lib/integrations/notify";
import { absolutePublicUrl } from "@/lib/public-url";
import { looksLikeCredential } from "@/lib/credential-check";
import type { AccessRequestStatus } from "@prisma/client";
import { createFollowUpTask, cancelFollowUpTask } from "@/services/followup";
import { generatePublicToken } from "@/lib/public-token";

function serializeWelcomeDoc(doc: {
  id: string;
  engagementId: string;
  publicToken: string;
  content: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: doc.id,
    engagementId: doc.engagementId,
    publicToken: doc.publicToken,
    content: doc.content,
    status: doc.status,
    sentAt: doc.sentAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

const FALLBACK_TEMPLATE = (clientName: string) =>
  `Hi ${clientName},\n\nWelcome aboard! We're excited to get started. ` +
  `We'll be in touch shortly with next steps. If you have any questions in the meantime, ` +
  `just reply to this message.`;

/**
 * Auto-drafts the welcome doc the moment payment clears (PRD §8) — no
 * manual "go write a welcome doc" step. Idempotent: calling this twice for
 * the same engagement returns the existing doc instead of regenerating it.
 *
 * Team info (PRD §8's "names/roles, configured once in settings") is just
 * `tenant.users` — no separate settings field needed, since User already
 * carries name/role per tenant. Falls back to a single-point-of-contact
 * framing if that list is just the owner (PRD §8 edge case).
 */
export async function autoCreateWelcomeDoc(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    const existing = await prisma.welcomeDoc.findFirst({ where: { engagementId } });
    if (existing) return serializeWelcomeDoc(existing);

    const engagement = await prisma.engagement.findFirstOrThrow({
      where: { id: engagementId, tenantId },
      include: { client: true },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const users = await prisma.user.findMany({ where: { tenantId }, select: { name: true, role: true } });

    const acceptedProposal = await prisma.proposal.findFirst({
      where: { engagementId, status: { in: ["accepted"] } },
      orderBy: { version: "desc" },
    });

    const result = await AIGateway.generate<string>({
      task: "welcome_doc",
      tenantId,
      engagementId,
      context: {
        businessName: tenant.businessName,
        clientName: engagement.client.name,
        scopeSummary: acceptedProposal?.coverNote ?? null,
        team: users.map((u) => ({ name: u.name, role: u.role })),
      },
      outputSchema: undefined,
    });

    const content = typeof result.draft === "string" && result.draft.trim()
      ? result.draft
      : FALLBACK_TEMPLATE(engagement.client.name);

    const doc = await prisma.welcomeDoc.create({ data: { engagementId, content, publicToken: generatePublicToken() } });
    return serializeWelcomeDoc(doc);
  });
}

export async function getWelcomeDocForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const doc = await prisma.welcomeDoc.findFirst({ where: { engagementId } });
    return doc ? serializeWelcomeDoc(doc) : null;
  });
}

export async function getWelcomeDocForOwner(ctx: TenantContext, docId: string) {
  return withTenant(ctx, async (tenantId) => {
    const doc = await prisma.welcomeDoc.findFirstOrThrow({
      where: { id: docId, engagement: { tenantId } },
    });
    return serializeWelcomeDoc(doc);
  });
}

export async function updateDraftWelcomeDoc(ctx: TenantContext, docId: string, content: string) {
  return withTenant(ctx, async (tenantId) => {
    const doc = await prisma.welcomeDoc.findFirstOrThrow({
      where: { id: docId, engagement: { tenantId } },
    });
    if (doc.status !== "draft") {
      throw new Error("Only a draft welcome doc can be edited.");
    }
    const updated = await prisma.welcomeDoc.update({ where: { id: docId }, data: { content } });
    return serializeWelcomeDoc(updated);
  });
}

/**
 * Sending the welcome doc advances the engagement off deposit_paid
 * (System Design §3.1) — the first onboarding artifact sent is what
 * marks the engagement as having entered onboarding, same "first send"
 * trigger pattern as every earlier stage transition.
 */
export async function sendWelcomeDoc(ctx: TenantContext, docId: string) {
  return withTenant(ctx, async (tenantId) => {
    const doc = await prisma.welcomeDoc.findFirstOrThrow({
      where: { id: docId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });
    if (doc.status !== "draft") {
      throw new Error("Only a draft welcome doc can be sent.");
    }

    await prisma.welcomeDoc.update({ where: { id: docId }, data: { status: "sent", sentAt: new Date() } });

    if (doc.engagement.stage === "deposit_paid") {
      await advanceStageAutomatically(ctx, doc.engagementId, "deposit_paid");
    }

    const publicUrl = `/w/${doc.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = doc.engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "welcome_doc_ready",
        templateParams: [client.name, absolutePublicUrl(publicUrl)],
      },
      email: {
        subject: "Welcome aboard!",
        html: `<p>Your welcome document is ready: <a href="${absolutePublicUrl(publicUrl)}">${absolutePublicUrl(publicUrl)}</a></p>`,
      },
      devLabel: "welcome doc link",
    });

    return { docId, publicUrl, emailed, whatsapped };
  });
}

export async function getPublicWelcomeDoc(token: string) {
  const doc = await prisma.welcomeDoc.findUniqueOrThrow({
    where: { publicToken: token },
    include: { engagement: { include: { client: true, tenant: true } } },
  });
  return {
    ...serializeWelcomeDoc(doc),
    businessName: doc.engagement.tenant.businessName,
    clientName: doc.engagement.client.name,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Intake Form (PRD §9)
// ─────────────────────────────────────────────────────────────────────────

export interface IntakeQuestion {
  id: string;
  label: string;
  required: boolean;
}

const questionsSchema = z.object({
  questions: z.array(z.object({ label: z.string(), required: z.boolean() })),
});

const DEFAULT_QUESTIONS: Omit<IntakeQuestion, "id">[] = [
  { label: "Please share any brand assets (logo, colors, fonts) we should use.", required: false },
  { label: "Who should we loop in from your side for approvals?", required: true },
  { label: "Is there a target date you're working toward?", required: false },
];

function serializeIntakeForm(form: {
  id: string;
  engagementId: string;
  publicToken: string;
  questions: unknown;
  status: string;
  createdAt: Date;
}) {
  return {
    id: form.id,
    engagementId: form.engagementId,
    publicToken: form.publicToken,
    questions: form.questions as IntakeQuestion[],
    status: form.status,
    createdAt: form.createdAt.toISOString(),
  };
}

async function generateQuestions(
  tenantId: string,
  engagementId: string,
  scopeSummary: string | null,
): Promise<IntakeQuestion[]> {
  const result = await AIGateway.generate<unknown>({
    task: "intake_questions",
    tenantId,
    engagementId,
    context: { scopeSummary },
    outputSchema: questionsSchema,
  });

  const parsed = questionsSchema.safeParse(result.draft);
  const questions = parsed.success ? parsed.data.questions : DEFAULT_QUESTIONS;
  return questions.map((q) => ({ id: randomUUID(), ...q }));
}

/**
 * Auto-drafts the intake form alongside the welcome doc, same deposit_paid
 * trigger (PRD §9). Idempotent like autoCreateWelcomeDoc.
 */
export async function autoCreateIntakeForm(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    const existing = await prisma.intakeForm.findFirst({ where: { engagementId } });
    if (existing) return serializeIntakeForm(existing);

    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const acceptedProposal = await prisma.proposal.findFirst({
      where: { engagementId, status: "accepted" },
      orderBy: { version: "desc" },
    });

    const questions = await generateQuestions(tenantId, engagementId, acceptedProposal?.coverNote ?? null);

    const form = await prisma.intakeForm.create({
      data: { engagementId, questions: questions as unknown as Prisma.InputJsonValue, publicToken: generatePublicToken() },
    });
    return serializeIntakeForm(form);
  });
}

export async function getIntakeFormForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const form = await prisma.intakeForm.findFirst({ where: { engagementId } });
    return form ? serializeIntakeForm(form) : null;
  });
}

export async function getIntakeFormForOwner(ctx: TenantContext, formId: string) {
  return withTenant(ctx, async (tenantId) => {
    const form = await prisma.intakeForm.findFirstOrThrow({
      where: { id: formId, engagement: { tenantId } },
    });
    const response = await prisma.intakeResponse.findFirst({ where: { intakeFormId: formId } });
    return {
      ...serializeIntakeForm(form),
      response: response
        ? { answers: response.answers as Record<string, string>, submittedAt: response.submittedAt.toISOString() }
        : null,
    };
  });
}

/**
 * Unlike Proposal/Invoice/Welcome Doc, this is NOT draft-only — PRD §9
 * explicitly says scope changes are common and the question set "is not
 * locked once sent," so the owner can edit it at any point in its life.
 */
export async function updateIntakeForm(ctx: TenantContext, formId: string, questions: IntakeQuestion[]) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.intakeForm.findFirstOrThrow({ where: { id: formId, engagement: { tenantId } } });
    const updated = await prisma.intakeForm.update({ where: { id: formId }, data: { questions: questions as unknown as Prisma.InputJsonValue } });
    return serializeIntakeForm(updated);
  });
}

/** Re-runs AI generation against current scope, overwriting the question set (PRD §9). */
export async function regenerateIntakeForm(ctx: TenantContext, formId: string) {
  return withTenant(ctx, async (tenantId) => {
    const form = await prisma.intakeForm.findFirstOrThrow({
      where: { id: formId, engagement: { tenantId } },
    });
    const acceptedProposal = await prisma.proposal.findFirst({
      where: { engagementId: form.engagementId, status: "accepted" },
      orderBy: { version: "desc" },
    });
    const questions = await generateQuestions(tenantId, form.engagementId, acceptedProposal?.coverNote ?? null);
    const updated = await prisma.intakeForm.update({ where: { id: formId }, data: { questions: questions as unknown as Prisma.InputJsonValue } });
    return serializeIntakeForm(updated);
  });
}

export async function sendIntakeForm(ctx: TenantContext, formId: string) {
  return withTenant(ctx, async (tenantId) => {
    const form = await prisma.intakeForm.findFirstOrThrow({
      where: { id: formId, engagement: { tenantId } },
      include: { engagement: { include: { client: true } } },
    });

    await prisma.intakeForm.update({ where: { id: formId }, data: { status: "sent" } });

    // PRD §12: enters the follow-up cadence the moment it's waiting on the client.
    await createFollowUpTask(tenantId, form.engagementId, "intake_form", formId);

    const publicUrl = `/intake/${form.publicToken}`;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const client = form.engagement.client;
    const { emailed, whatsapped } = await notifyClient({
      tenantId,
      channelPreference: tenant.notificationChannel,
      clientPhone: client.phone,
      clientEmail: client.email,
      whatsapp: {
        templateName: "intake_form_request",
        templateParams: [client.name, absolutePublicUrl(publicUrl)],
      },
      email: {
        subject: "A few quick questions to get started",
        html: `<p>Please fill this out when you get a chance: <a href="${absolutePublicUrl(publicUrl)}">${absolutePublicUrl(publicUrl)}</a></p>`,
      },
      devLabel: "intake form link",
    });

    return { formId, publicUrl, emailed, whatsapped };
  });
}

export async function getPublicIntakeForm(token: string) {
  const form = await prisma.intakeForm.findUniqueOrThrow({
    where: { publicToken: token },
    include: { engagement: { include: { client: true, tenant: true } } },
  });
  const response = await prisma.intakeResponse.findFirst({ where: { intakeFormId: form.id } });

  return {
    ...serializeIntakeForm(form),
    id: form.publicToken,
    businessName: form.engagement.tenant.businessName,
    clientName: form.engagement.client.name,
    alreadySubmitted: Boolean(response),
  };
}

/**
 * One response per form — a resubmission attempt is rejected rather than
 * silently overwriting what the owner may already be acting on.
 */
export async function submitIntakeResponse(token: string, answers: Record<string, string>) {
  const form = await prisma.intakeForm.findUniqueOrThrow({ where: { publicToken: token } });
  const questions = form.questions as unknown as IntakeQuestion[];

  const existing = await prisma.intakeResponse.findFirst({ where: { intakeFormId: form.id } });
  if (existing) {
    throw new Error("This form has already been submitted.");
  }

  const missing = questions.filter((q) => q.required && !answers[q.id]?.trim());
  if (missing.length > 0) {
    throw new Error(`Please answer: ${missing.map((q) => q.label).join(", ")}`);
  }

  const response = await prisma.intakeResponse.create({ data: { intakeFormId: form.id, answers } });
  await cancelFollowUpTask("intake_form", form.id);
  return { id: response.id, submittedAt: response.submittedAt.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────
// Request for Access (PRD §10) — the hard "never store a raw credential"
// boundary (System Design §4). AccessRequest has no free-text column for
// client input, by design: there is nowhere for a pasted credential to
// land even if the heuristic check below has a false negative.
// ─────────────────────────────────────────────────────────────────────────

export interface PlatformTemplate {
  name: string;
  inviteSupported: boolean;
  instructions: string; // "{{agencyEmail}}" is interpolated at request time
}

// Invite-based (preferred, System Design §4): the platform supports adding
// a collaborator directly, no credential ever changes hands.
// Instruction-only (fallback): no invite flow exists; steps describe the
// closest safe alternative, never "share your password."
export const PLATFORM_LIBRARY: PlatformTemplate[] = [
  {
    name: "Google Analytics",
    inviteSupported: true,
    instructions:
      "1. Go to Admin > Account Access Management (or Property Access Management).\n" +
      "2. Click + > Add users.\n" +
      "3. Enter {{agencyEmail}} and assign the Editor role.\n" +
      "4. Click Add.",
  },
  {
    name: "Google Ads",
    inviteSupported: true,
    instructions:
      "1. Go to Tools & Settings > Access and security > Users.\n" +
      "2. Click + (Add user).\n" +
      "3. Enter {{agencyEmail}} and select Standard access.\n" +
      "4. Click Send invitation.",
  },
  {
    name: "Meta Business Suite",
    inviteSupported: true,
    instructions:
      "1. Go to Business Settings > Users > People.\n" +
      "2. Click Add.\n" +
      "3. Enter {{agencyEmail}} and select the Page/Ad Account to share.\n" +
      "4. Assign the appropriate task access and click Invite.",
  },
  {
    name: "WordPress",
    inviteSupported: true,
    instructions:
      "1. Go to Users > Add New in your WordPress dashboard.\n" +
      "2. Enter {{agencyEmail}} as the username/email.\n" +
      "3. Set the role to Administrator.\n" +
      "4. Click Add New User.",
  },
  {
    name: "Shopify",
    inviteSupported: true,
    instructions:
      "1. Go to Settings > Users and permissions.\n" +
      "2. Click Add staff (or Add collaborator if we're a partner).\n" +
      "3. Enter {{agencyEmail}} and grant the permissions needed for this project.\n" +
      "4. Click Send invite.",
  },
  {
    name: "Domain Registrar",
    inviteSupported: false,
    instructions:
      "Most domain registrars don't support adding a collaborator account. Please reply with " +
      "the name of your registrar (GoDaddy, Namecheap, etc.) so we can send exact steps — " +
      "usually this means granting us delegate or DNS-management access from your account, " +
      "never sharing your login directly.",
  },
  {
    name: "Hosting Provider",
    inviteSupported: false,
    instructions:
      "Please check if your hosting panel (cPanel, Plesk, etc.) has a \"team\" or \"users\" " +
      "section and add {{agencyEmail}} there. If you're not sure, reply with the name of your " +
      "host and we'll send specific steps — never share your hosting login directly.",
  },
];

function interpolate(template: string, agencyEmail: string): string {
  return template.replaceAll("{{agencyEmail}}", agencyEmail);
}

function serializeAccessRequest(req: {
  id: string;
  engagementId: string;
  platform: string;
  instructions: string;
  status: string;
  requestedAt: Date;
  grantedAt: Date | null;
}) {
  return {
    id: req.id,
    engagementId: req.engagementId,
    platform: req.platform,
    instructions: req.instructions,
    status: req.status,
    requestedAt: req.requestedAt.toISOString(),
    grantedAt: req.grantedAt?.toISOString() ?? null,
  };
}

/**
 * Creates one AccessRequest per selected platform in a single action (PRD
 * §10: "request access to 5 platforms in under 2 minutes, as one
 * consolidated client-facing request"). Known platforms use the static
 * template library; anything else falls through to the AI Gateway.
 */
export async function createAccessRequests(
  ctx: TenantContext,
  engagementId: string,
  platformNames: string[],
) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const owner = await prisma.user.findFirst({ where: { tenantId, role: "owner" } });
    const agencyEmail = owner?.email ?? "our team";

    const created = await Promise.all(
      platformNames.map(async (name) => {
        const known = PLATFORM_LIBRARY.find((p) => p.name === name);
        let instructions: string;

        if (known) {
          instructions = interpolate(known.instructions, agencyEmail);
        } else {
          const result = await AIGateway.generate<string>({
            task: "access_instructions",
            tenantId,
            engagementId,
            context: { platform: name, agencyEmail },
            outputSchema: undefined,
          });
          instructions =
            typeof result.draft === "string" && result.draft.trim()
              ? result.draft
              : `Please add ${agencyEmail} as a user on ${name}, or reply so we can send specific steps.`;
        }

        const request = await prisma.accessRequest.create({ data: { engagementId, platform: name, instructions } });
        // PRD §12: enters the follow-up cadence the moment it's waiting on the client.
        await createFollowUpTask(tenantId, engagementId, "access_request", request.id);
        return request;
      }),
    );

    return created.map(serializeAccessRequest);
  });
}

export async function listAccessRequestsForEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });
    const requests = await prisma.accessRequest.findMany({
      where: { engagementId },
      orderBy: { requestedAt: "asc" },
    });
    return requests.map(serializeAccessRequest);
  });
}

export async function setAccessRequestStatus(
  ctx: TenantContext,
  requestId: string,
  status: Extract<AccessRequestStatus, "granted" | "na">,
) {
  return withTenant(ctx, async (tenantId) => {
    await prisma.accessRequest.findFirstOrThrow({ where: { id: requestId, engagement: { tenantId } } });
    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: { status, grantedAt: status === "granted" ? new Date() : null },
    });
    await cancelFollowUpTask("access_request", requestId);
    return serializeAccessRequest(updated);
  });
}

export async function getPublicAccessChecklist(token: string) {
  const engagement = await prisma.engagement.findUniqueOrThrow({
    where: { publicToken: token },
    include: { client: true, tenant: true },
  });
  const requests = await prisma.accessRequest.findMany({
    where: { engagementId: engagement.id },
    orderBy: { requestedAt: "asc" },
  });
  return {
    businessName: engagement.tenant.businessName,
    clientName: engagement.client.name,
    requests: requests.map(serializeAccessRequest),
  };
}

/**
 * Client self-reports a platform as done. `note` is validated against the
 * credential heuristic and rejected outright if it looks like one — but
 * note is NEVER persisted either way, since AccessRequest has no column
 * for it. This is UX guidance for the client, not a storage decision.
 */
export async function clientMarkAccessRequestGranted(requestId: string, note?: string) {
  if (note && looksLikeCredential(note)) {
    throw new Error(
      "That looks like it might contain a password or login. Please use the platform's own " +
        "invite/add-user feature instead of sharing credentials here.",
    );
  }

  const request = await prisma.accessRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "requested") {
    throw new Error("This item has already been updated.");
  }

  const updated = await prisma.accessRequest.update({
    where: { id: requestId },
    data: { status: "granted", grantedAt: new Date() },
  });
  await cancelFollowUpTask("access_request", requestId);
  return serializeAccessRequest(updated);
}
