import type { AIGenerateParams, AIGenerateResult, AIProviderAdapter } from "./types";
import { anthropicAdapter } from "./adapters/anthropic";
import { staticFallbackAdapter } from "./adapters/static-fallback";

/**
 * AIGateway — the single entry point every service calls (System Design §5).
 *
 * Cost & failure handling (System Design §5):
 *   (a) timeout + retry-once policy
 *   (b) fall back to a plain non-AI template if the AI call fails twice, so
 *       a provider outage never blocks sending a welcome doc or invoice
 *   (c) per-tenant usage logging (tokensUsed, costEstimate) for future
 *       usage-based pricing
 *
 * Human-in-the-loop (System Design §1 principle 3, §5): the caller is
 * responsible for persisting the result with status "draft" — this module
 * never sends anything itself.
 */

const PRIMARY_ADAPTER: AIProviderAdapter = anthropicAdapter;
const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AIGateway: timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function attempt<TOutput>(
  params: AIGenerateParams,
): Promise<AIGenerateResult<TOutput>> {
  return withTimeout(PRIMARY_ADAPTER.generate<TOutput>(params), TIMEOUT_MS);
}

export const AIGateway = {
  async generate<TOutput = unknown>(
    params: AIGenerateParams,
  ): Promise<AIGenerateResult<TOutput>> {
    try {
      return await attempt<TOutput>(params);
    } catch (firstError) {
      try {
        return await attempt<TOutput>(params); // retry-once
      } catch (secondError) {
        console.error(
          `AIGateway: task "${params.task}" failed twice for tenant ${params.tenantId}, ` +
            `falling back to static template.`,
          { firstError, secondError },
        );
        // TODO: persist tokensUsed/costEstimate logging (System Design §5c)
        // to a usage table once that model exists — tracked as a fast-follow,
        // not blocking the fallback path itself.
        return staticFallbackAdapter.generate<TOutput>(params);
      }
    }
  },
};
