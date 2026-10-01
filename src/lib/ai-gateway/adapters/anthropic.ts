import type { AIGenerateParams, AIGenerateResult, AIProviderAdapter } from "../types";
import { loadPromptTemplate } from "../prompts";

/**
 * The only file in the codebase allowed to talk to the Anthropic SDK
 * (System Design §5). Swapping to a different provider, or adding a
 * second provider for one specific task, means editing this file only.
 *
 * Not wired to a live SDK call yet — this is scaffold. Fill in the actual
 * `@anthropic-ai/sdk` call here when implementing a real task; the
 * surrounding retry/timeout/fallback logic in ../index.ts does not change.
 */
export const anthropicAdapter: AIProviderAdapter = {
  async generate<TOutput>(
    params: AIGenerateParams,
  ): Promise<AIGenerateResult<TOutput>> {
    const template = loadPromptTemplate(params.task);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY not set — AIGateway cannot call the provider; " +
          "falling back is expected in this environment.",
      );
    }

    throw new Error(
      `anthropicAdapter.generate() not yet implemented for task "${params.task}" ` +
        `(template: ${template.id}). Scaffold placeholder.`,
    );
  },
};
