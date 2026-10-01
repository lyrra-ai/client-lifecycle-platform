import type { AITask } from "../types";

/**
 * Per-task prompt templates live in config, not scattered in code
 * (System Design §5) — one template per task, versioned, so prompt
 * quality can be iterated without touching feature code. Still deployed
 * as code in v1 (not a live-editable prompt CMS — out of scope for v1).
 */
export interface PromptTemplate {
  id: AITask;
  version: number;
  systemPrompt: string;
}

const TEMPLATES: Record<AITask, PromptTemplate> = {
  proposal_draft: {
    id: "proposal_draft",
    version: 1,
    systemPrompt:
      "Expand a short project brief into full proposal line items and a cover note.",
  },
  welcome_doc: {
    id: "welcome_doc",
    version: 1,
    systemPrompt: "Draft a welcome document from the engagement scope and team info.",
  },
  intake_questions: {
    id: "intake_questions",
    version: 1,
    systemPrompt: "Draft a scope-specific intake questionnaire.",
  },
  access_instructions: {
    id: "access_instructions",
    version: 1,
    systemPrompt: "Generate invite-based or instruction-only access-request steps for a platform.",
  },
  kickoff_agenda: {
    id: "kickoff_agenda",
    version: 1,
    systemPrompt: "Draft a kickoff-call agenda from engagement scope and intake answers.",
  },
  call_summary: {
    id: "call_summary",
    version: 1,
    systemPrompt: "Summarize a kickoff call recording/notes into a summary and action items.",
  },
  followup_message: {
    id: "followup_message",
    version: 1,
    systemPrompt:
      "Draft a short nudge for an outstanding item; tone escalates gently with attempt number.",
  },
  handover_summary: {
    id: "handover_summary",
    version: 1,
    systemPrompt: "Summarize what was delivered against the original scope for a handover packet.",
  },
};

export function loadPromptTemplate(task: AITask): PromptTemplate {
  return TEMPLATES[task];
}
