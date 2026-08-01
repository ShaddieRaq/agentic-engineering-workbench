import { describe, expect, it, vi } from "vitest";
import type { HarnessResult } from "../src/harness/harnessResult.js";
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResult,
} from "../src/providers/aiProvider.js";
import { AIProviderError } from "../src/providers/aiProviderError.js";
import { runModelBasedEvaluation } from "../src/evaluations/modelBasedEvaluatorRunner.js";

function subject(passed = true): HarnessResult {
  return {
    runId: "run-1",
    harnessId: "test-harness",
    scenarioId: "test-scenario",
    role: { id: "test-role", instructions: "Be accurate." },
    task: { id: "test-task", instruction: "Explain the system." },
    context: [],
    prompt: "Explain the system.",
    output: "A technically complete explanation.",
    parsedOutput: null,
    refusal: null,
    provider: null,
    executionFailure: null,
    evaluations: [
      { evaluatorId: "required-phrase", passed, message: "Checked." },
    ],
    passed,
    durationMs: 1,
    completedAt: "2026-08-01T12:00:00.000Z",
  };
}

function judgeProvider(verdict: "pass" | "fail" | "uncertain"): AIProvider {
  return {
    async generate<TOutput>(
      request: AIProviderRequest<TOutput>,
    ): Promise<AIProviderResult<TOutput>> {
      expect(request.outputSchema).toBeDefined();
      const parsedOutput = request.outputSchema!.parse({
        verdict,
        score: verdict === "pass" ? 90 : 30,
        rationale: "Independent judgment.",
        criteria: [
          {
            criterion: "Technical accuracy",
            passed: verdict === "pass",
            evidence: "The subject output was inspected.",
          },
        ],
      });

      return {
        rawOutput: JSON.stringify(parsedOutput),
        parsedOutput,
        refusal: null,
        provider: {
          model: "gpt-5.4-mini-2026-03-17",
          usage: {
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 30,
            reasoningTokens: 10,
            totalTokens: 130,
          },
        },
      };
    },
  };
}

describe("runModelBasedEvaluation", () => {
  it("preserves versioned judge output, usage, cost, and latency evidence", async () => {
    const result = await runModelBasedEvaluation(
      subject(),
      judgeProvider("pass"),
      {
        promptVersion: "technical-quality-v1",
        criteria: ["Technical accuracy"],
      },
    );

    expect(result).toMatchObject({
      evaluatorId: "model-technical-quality",
      promptVersion: "technical-quality-v1",
      subjectRunId: "run-1",
      provider: { model: "gpt-5.4-mini-2026-03-17" },
      disagreement: {
        deterministicPassed: true,
        modelPassed: true,
        disagreed: false,
      },
      succeeded: true,
    });
    expect(result.prompt).toContain("EVALUATOR PROMPT VERSION: technical-quality-v1");
    expect(result.cost.totalTokens).toBe(130);
    expect(result.cost.estimatedCostUsd).not.toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records disagreement without replacing deterministic evidence", async () => {
    const result = await runModelBasedEvaluation(
      subject(true),
      judgeProvider("fail"),
      { criteria: ["Technical accuracy"] },
    );

    expect(result.disagreement).toEqual({
      deterministicPassed: true,
      modelPassed: false,
      disagreed: true,
    });
    expect(subject(true).evaluations).toEqual([
      { evaluatorId: "required-phrase", passed: true, message: "Checked." },
    ]);
  });

  it("does not force disagreement when the judge is uncertain", async () => {
    const result = await runModelBasedEvaluation(
      subject(false),
      judgeProvider("uncertain"),
      { criteria: ["Technical accuracy"] },
    );

    expect(result.disagreement.disagreed).toBeNull();
    expect(result.disagreement.modelPassed).toBeNull();
  });

  it("classifies provider failures without rejecting evaluation evidence", async () => {
    const provider = {
      generate: vi.fn(async () => {
        throw new AIProviderError("transport", "Judge unavailable.");
      }),
    } satisfies AIProvider;

    const result = await runModelBasedEvaluation(
      subject(),
      provider,
      { criteria: ["Technical accuracy"] },
    );

    expect(result.executionFailure).toEqual({
      category: "transport",
      message: "Judge unavailable.",
    });
    expect(result.provider).toBeNull();
    expect(result.cost.estimatedCostUsd).toBeNull();
    expect(result.succeeded).toBe(false);
  });
});
