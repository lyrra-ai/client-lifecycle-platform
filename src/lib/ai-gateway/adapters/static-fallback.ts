import type { AIGenerateParams, AIGenerateResult, AIProviderAdapter } from "../types";

/**
 * Fallback adapter used when the primary provider fails twice
 * (System Design §5). Returns a plain, non-AI templated result per task so
 * a provider outage never blocks sending a welcome doc, invoice, or any
 * other time-sensitive artifact.
 *
 * These templates are intentionally plain — they exist to unblock the
 * workflow, not to be a good draft. The owner is expected to edit before
 * sending, same as an AI draft (System Design §1 principle 3).
 */
const FALLBACK_TEXT: Record<string, string> = {
  proposal_draft: "Thank you for the opportunity to work together. Scope and pricing below.",
  welcome_doc: "Welcome aboard! We're excited to get started — details on next steps to follow.",
  intake_questions: "Please share any project details, assets, and timelines we should know about.",
  access_instructions: "Please add us as a user on the relevant platform(s) for this project.",
  kickoff_agenda: "Agenda: introductions, scope recap, timeline, next steps.",
  call_summary: "Summary pending — please add notes manually.",
  followup_message: "Just checking in on this — let us know if you have any questions.",
  handover_summary: "Project delivered. Full details available on request.",
};

export const staticFallbackAdapter: AIProviderAdapter = {
  async generate<TOutput>(
    params: AIGenerateParams,
  ): Promise<AIGenerateResult<TOutput>> {
    return {
      draft: (FALLBACK_TEXT[params.task] ?? "Draft unavailable — please write manually.") as TOutput,
      modelUsed: "static-fallback",
      tokensUsed: 0,
      costEstimate: 0,
    };
  },
};
