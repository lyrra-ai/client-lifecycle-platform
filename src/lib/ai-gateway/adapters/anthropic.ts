import Anthropic from "@anthropic-ai/sdk";
import type { AIGenerateParams, AIGenerateResult, AIProviderAdapter } from "../types";
import { loadPromptTemplate } from "../prompts";

/**
 * The only file in the codebase allowed to talk to the Anthropic SDK
 * (System Design §5). Swapping to a different provider, or adding a
 * second provider for one specific task, means editing this file only.
 *
 * Per-task output shape is described in the task's prompt template
 * (../prompts/index.ts) rather than enforced via the SDK's tool-use
 * schema — keeps this adapter generic across every task instead of
 * special-casing each one here. The caller (service layer) is
 * responsible for validating/normalizing the parsed JSON.
 */
const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 1024;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractJson(text: string): unknown {
  // Models occasionally wrap JSON in a fenced block despite instructions —
  // strip fences before parsing rather than failing the whole call on it.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  return JSON.parse(candidate.trim());
}

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

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: template.systemPrompt,
      messages: [
        { role: "user", content: JSON.stringify(params.context) },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`anthropicAdapter: no text content in response for task "${params.task}".`);
    }

    const draft = (
      template.responseFormat === "json" ? extractJson(textBlock.text) : textBlock.text.trim()
    ) as TOutput;

    return {
      draft,
      modelUsed: response.model,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      // TODO: per-model cost table (System Design §5c) — tracked as a
      // fast-follow, not blocking this adapter's correctness.
      costEstimate: 0,
    };
  },
};
