import type {
  AIProviderEvidence,
  AIProviderUsage,
} from "../providers/aiProvider.js";

export interface ModelTokenPricing {
  id: string;
  modelPattern: RegExp;
  maximumInputTokensExclusive: number;
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  sourceUrl: string;
  observedOn: string;
}

export const gpt54StandardShortContextPricing: ModelTokenPricing = {
  id: "openai-gpt-5.4-standard-short-context-2026-08-01",
  modelPattern: /^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/,
  maximumInputTokensExclusive: 272_000,
  inputUsdPerMillionTokens: 2.5,
  cachedInputUsdPerMillionTokens: 0.25,
  outputUsdPerMillionTokens: 15,
  sourceUrl: "https://developers.openai.com/api/docs/pricing",
  observedOn: "2026-08-01",
};

export interface TokenCostSummary {
  runCount: number;
  usageSampleCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  pricingIds: string[];
}

export type TokenComparisonClassification =
  | "fewer"
  | "more"
  | "unchanged"
  | "insufficient-evidence";

export type CostComparisonClassification =
  | "cheaper"
  | "more-expensive"
  | "unchanged"
  | "insufficient-evidence";

export interface TokenCostComparison {
  baseline: TokenCostSummary;
  candidate: TokenCostSummary;
  totalTokensDelta: number | null;
  estimatedCostDeltaUsd: number | null;
  tokenClassification: TokenComparisonClassification;
  costClassification: CostComparisonClassification;
}

function getPricing(
  evidence: AIProviderEvidence,
): ModelTokenPricing | null {
  const pricing = gpt54StandardShortContextPricing;

  if (
    !pricing.modelPattern.test(evidence.model) ||
    evidence.usage === null ||
    evidence.usage.inputTokens >=
      pricing.maximumInputTokensExclusive
  ) {
    return null;
  }

  return pricing;
}

function estimateCostUsd(
  usage: AIProviderUsage,
  pricing: ModelTokenPricing,
): number {
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens,
  );

  return (
    uncachedInputTokens * pricing.inputUsdPerMillionTokens +
    usage.cachedInputTokens *
      pricing.cachedInputUsdPerMillionTokens +
    usage.outputTokens * pricing.outputUsdPerMillionTokens
  ) / 1_000_000;
}

export function summarizeTokenCosts(
  evidence: ReadonlyArray<AIProviderEvidence | null>,
): TokenCostSummary {
  const available = evidence.filter(
    (item): item is AIProviderEvidence => item?.usage !== null && item !== null,
  );
  const pricing = available.map(getPricing);
  const pricingComplete = pricing.every(
    (item): item is ModelTokenPricing => item !== null,
  );

  return {
    runCount: evidence.length,
    usageSampleCount: available.length,
    inputTokens: available.reduce(
      (total, item) => total + item.usage!.inputTokens,
      0,
    ),
    cachedInputTokens: available.reduce(
      (total, item) => total + item.usage!.cachedInputTokens,
      0,
    ),
    outputTokens: available.reduce(
      (total, item) => total + item.usage!.outputTokens,
      0,
    ),
    reasoningTokens: available.reduce(
      (total, item) => total + item.usage!.reasoningTokens,
      0,
    ),
    totalTokens: available.reduce(
      (total, item) => total + item.usage!.totalTokens,
      0,
    ),
    estimatedCostUsd:
      available.length > 0 && pricingComplete
        ? available.reduce(
            (total, item, index) =>
              total + estimateCostUsd(item.usage!, pricing[index]!),
            0,
          )
        : null,
    pricingIds: pricingComplete
      ? [...new Set(pricing.map((item) => item.id))]
      : [],
  };
}

function hasCompleteComparableUsage(
  baseline: TokenCostSummary,
  candidate: TokenCostSummary,
): boolean {
  return (
    baseline.runCount > 0 &&
    baseline.runCount === candidate.runCount &&
    baseline.usageSampleCount === baseline.runCount &&
    candidate.usageSampleCount === candidate.runCount
  );
}

export function compareTokenCostSummaries(
  baseline: TokenCostSummary,
  candidate: TokenCostSummary,
): TokenCostComparison {
  const usageIsComparable = hasCompleteComparableUsage(
    baseline,
    candidate,
  );
  const totalTokensDelta = usageIsComparable
    ? candidate.totalTokens - baseline.totalTokens
    : null;
  const costIsComparable =
    usageIsComparable &&
    baseline.estimatedCostUsd !== null &&
    candidate.estimatedCostUsd !== null;
  const estimatedCostDeltaUsd = costIsComparable
    ? candidate.estimatedCostUsd! - baseline.estimatedCostUsd!
    : null;

  return {
    baseline,
    candidate,
    totalTokensDelta,
    estimatedCostDeltaUsd,
    tokenClassification:
      totalTokensDelta === null
        ? "insufficient-evidence"
        : totalTokensDelta < 0
          ? "fewer"
          : totalTokensDelta > 0
            ? "more"
            : "unchanged",
    costClassification:
      estimatedCostDeltaUsd === null
        ? "insufficient-evidence"
        : estimatedCostDeltaUsd < 0
          ? "cheaper"
          : estimatedCostDeltaUsd > 0
            ? "more-expensive"
            : "unchanged",
  };
}
