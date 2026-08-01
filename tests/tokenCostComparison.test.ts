import { describe, expect, it } from "vitest";
import {
  compareTokenCostSummaries,
  summarizeTokenCosts,
} from "../src/orchestration/tokenCostComparison.js";

describe("token cost evidence", () => {
  it("summarizes GPT-5.4 token usage and standard estimated cost", () => {
    const summary = summarizeTokenCosts([
      {
        model: "gpt-5.4",
        usage: {
          inputTokens: 1_000,
          cachedInputTokens: 200,
          outputTokens: 100,
          reasoningTokens: 50,
          totalTokens: 1_100,
        },
      },
      {
        model: "gpt-5.4-2026-06-01",
        usage: {
          inputTokens: 2_000,
          cachedInputTokens: 0,
          outputTokens: 200,
          reasoningTokens: 100,
          totalTokens: 2_200,
        },
      },
    ]);

    expect(summary).toMatchObject({
      runCount: 2,
      usageSampleCount: 2,
      inputTokens: 3_000,
      cachedInputTokens: 200,
      outputTokens: 300,
      reasoningTokens: 150,
      totalTokens: 3_300,
      pricingIds: [
        "openai-gpt-5.4-standard-short-context-2026-08-01",
      ],
    });
    expect(summary.estimatedCostUsd).toBeCloseTo(0.01155);
  });

  it("compares complete token and cost evidence", () => {
    const baseline = summarizeTokenCosts([
      {
        model: "gpt-5.4",
        usage: {
          inputTokens: 1_000,
          cachedInputTokens: 0,
          outputTokens: 100,
          reasoningTokens: 0,
          totalTokens: 1_100,
        },
      },
    ]);
    const candidate = summarizeTokenCosts([
      {
        model: "gpt-5.4",
        usage: {
          inputTokens: 900,
          cachedInputTokens: 0,
          outputTokens: 80,
          reasoningTokens: 0,
          totalTokens: 980,
        },
      },
    ]);

    expect(
      compareTokenCostSummaries(baseline, candidate),
    ).toMatchObject({
      totalTokensDelta: -120,
      tokenClassification: "fewer",
      costClassification: "cheaper",
    });
  });

  it("does not compare incomplete usage evidence", () => {
    const comparison = compareTokenCostSummaries(
      summarizeTokenCosts([null]),
      summarizeTokenCosts([null]),
    );

    expect(comparison).toMatchObject({
      totalTokensDelta: null,
      estimatedCostDeltaUsd: null,
      tokenClassification: "insufficient-evidence",
      costClassification: "insufficient-evidence",
    });
  });
});
