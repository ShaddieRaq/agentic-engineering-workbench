import type {
  AIProvider,
  AIProviderEvidence,
  AIProviderRequest,
  AIProviderResult,
  AIProviderUsage,
} from "./aiProvider.js";

function emptyUsage(): AIProviderUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

export interface UsageCollectingProvider {
  provider: AIProvider;
  evidence(fallbackModel: string): AIProviderEvidence | undefined;
}

export function createUsageCollectingProvider(
  inner: AIProvider,
): UsageCollectingProvider {
  const samples: AIProviderEvidence[] = [];

  return {
    provider: {
      async generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
      ): Promise<AIProviderResult<TOutput>> {
        const result = await inner.generate(request);
        samples.push(result.provider);
        return result;
      },
    },
    evidence(fallbackModel) {
      if (samples.length === 0) return undefined;
      if (samples.some(({ usage }) => usage === null)) {
        return {
          model: samples[0]?.model ?? fallbackModel,
          usage: null,
        };
      }
      const usage = samples.reduce(
        (total, sample) => ({
          inputTokens: total.inputTokens + sample.usage!.inputTokens,
          cachedInputTokens:
            total.cachedInputTokens + sample.usage!.cachedInputTokens,
          outputTokens: total.outputTokens + sample.usage!.outputTokens,
          reasoningTokens:
            total.reasoningTokens + sample.usage!.reasoningTokens,
          totalTokens: total.totalTokens + sample.usage!.totalTokens,
        }),
        emptyUsage(),
      );
      return {
        model: samples[0]?.model ?? fallbackModel,
        usage,
      };
    },
  };
}
