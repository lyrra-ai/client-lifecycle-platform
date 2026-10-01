// AI Gateway — System Design §5.
//
// This is the ONLY module boundary that is allowed to know about an AI
// vendor's SDK. Every AI-touching feature (Proposal, Onboarding, Kickoff,
// Follow-up, Feedback services) calls AIGateway.generate() and never
// imports a provider SDK directly — swapping providers means changing one
// adapter, not touching feature code.

export type AITask =
  | "proposal_draft"
  | "welcome_doc"
  | "intake_questions"
  | "access_instructions"
  | "kickoff_agenda"
  | "call_summary"
  | "followup_message"
  | "handover_summary";

export interface AIGenerateParams<TContext = Record<string, unknown>> {
  task: AITask;
  tenantId: string;
  engagementId: string;
  /** Structured, task-specific input — never raw free text alone (System Design §5). */
  context: TContext;
  /** JSON schema (or zod schema) the response must validate against. */
  outputSchema: unknown;
}

export interface AIGenerateResult<TOutput = unknown> {
  draft: TOutput;
  modelUsed: string;
  tokensUsed: number;
  costEstimate: number;
}

export interface AIProviderAdapter {
  generate<TOutput = unknown>(
    params: AIGenerateParams,
  ): Promise<AIGenerateResult<TOutput>>;
}
