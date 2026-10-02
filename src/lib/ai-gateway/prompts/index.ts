import type { AITask } from "../types";

/**
 * Per-task prompt templates live in config, not scattered in code
 * (System Design §5) — one template per task, versioned, so prompt
 * quality can be iterated without touching feature code. Still deployed
 * as code in v1 (not a live-editable prompt CMS — out of scope for v1).
 *
 * `responseFormat` tells the adapter (../adapters/anthropic.ts) whether to
 * parse the model's reply as JSON or hand it back as plain text — getting
 * this wrong for a text task (e.g. forcing JSON.parse on welcome-doc prose)
 * would needlessly trip the retry/fallback path on every call.
 */
export interface PromptTemplate {
  id: AITask;
  version: number;
  systemPrompt: string;
  responseFormat: "json" | "text";
}

const TEMPLATES: Record<AITask, PromptTemplate> = {
  proposal_draft: {
    id: "proposal_draft",
    version: 1,
    responseFormat: "json",
    systemPrompt:
      "Expand a short project brief into full proposal line items and a cover note. " +
      "Respond with ONLY a single JSON object, no markdown fences, no commentary, " +
      'matching exactly this shape: {"coverNote": string, "lineItems": ' +
      '[{"description": string, "qty": number, "unitPrice": number, "currency": "INR" | "USD"}]}. ' +
      "unitPrice is in whole currency units (rupees or dollars), not minor units. " +
      "Infer currency from the brief; default to INR if unclear.",
  },
  welcome_doc: {
    id: "welcome_doc",
    version: 1,
    responseFormat: "text",
    systemPrompt:
      "Draft a short, warm welcome document for a client whose project just started. " +
      "Cover: a team introduction (using the names/roles given), a one-paragraph recap of " +
      "what was scoped, what happens next, and how to reach the team. " +
      "If no team members are given, write it as a single point of contact instead of " +
      "inventing names. Plain prose, no markdown headers, no JSON — this is sent as-is.",
  },
  intake_questions: {
    id: "intake_questions",
    version: 1,
    responseFormat: "json",
    systemPrompt:
      "Draft a scope-specific intake questionnaire for a client whose project just started. " +
      "Ask only what's needed to begin work on the given scope — assets, access, preferences, " +
      "timelines specific to that scope, not generic project-management boilerplate. " +
      "Respond with ONLY a single JSON object, no markdown fences, no commentary, matching " +
      'exactly this shape: {"questions": [{"label": string, "required": boolean}]}. ' +
      "5-8 questions is typical; fewer for a narrow scope, more for a broad one.",
  },
  access_instructions: {
    id: "access_instructions",
    version: 1,
    responseFormat: "text",
    systemPrompt:
      "Generate short, numbered steps for a client to add the agency as a collaborator/user " +
      "on the named platform, using the given agency contact email. If you aren't confident " +
      "the platform supports adding a user, instead write instructions for sharing access a " +
      "different way (e.g. delegate access, a shared panel invite) — never instruct the client " +
      "to share a password or login credential directly, under any circumstance. Plain text, " +
      "no markdown, 3-5 short steps.",
  },
  kickoff_agenda: {
    id: "kickoff_agenda",
    version: 1,
    responseFormat: "json",
    systemPrompt:
      "Draft a kickoff-call agenda from the engagement's scope and intake-form answers. " +
      "Respond with ONLY a single JSON object, no markdown fences, no commentary, matching " +
      'exactly this shape: {"sections": [{"title": string, "durationMinutes": number, ' +
      '"talkingPoints": [string]}]}. Keep total duration realistic for a short kickoff call ' +
      "(30-45 minutes), 4-6 sections.",
  },
  call_summary: {
    id: "call_summary",
    version: 1,
    responseFormat: "json",
    systemPrompt:
      "Summarize kickoff-call notes into a short summary and a list of action items, each " +
      "assigned to whichever side (agency or client) owes it. Respond with ONLY a single JSON " +
      'object, no markdown fences, no commentary, matching exactly this shape: {"summaryText": ' +
      'string, "actionItems": [{"description": string, "owner": "agency" | "client"}]}.',
  },
  followup_message: {
    id: "followup_message",
    version: 1,
    responseFormat: "text",
    systemPrompt:
      "Draft a short, friendly nudge (2-4 sentences, no subject line) asking the client to " +
      "complete an outstanding item. Given the attempt number: attempt 1 is a gentle reminder, " +
      "attempt 2 is a direct ask, attempt 3+ says something like 'let us know if priorities have " +
      "changed' rather than repeating the same request. Never nag or guilt-trip. Plain text.",
  },
  handover_summary: {
    id: "handover_summary",
    version: 1,
    responseFormat: "text",
    systemPrompt: "Summarize what was delivered against the original scope for a handover packet.",
  },
};

export function loadPromptTemplate(task: AITask): PromptTemplate {
  return TEMPLATES[task];
}
