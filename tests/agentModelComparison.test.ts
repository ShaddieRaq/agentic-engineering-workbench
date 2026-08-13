import { describe, expect, it } from "vitest";
import type { AgentEvaluationEvidence } from "../src/agents/agentApplicationService.js";
import {
  agentModelComparisonSchema,
  formatModelComparisonCell,
  runAgentModelComparison,
  type ModelComparisonVerifier,
} from "../src/agents/modelComparison/agentModelComparison.js";
import type { AIProviderEvidence } from "../src/providers/aiProvider.js";

function usage(
  model: string,
  inputTokens: number,
  outputTokens: number,
): AIProviderEvidence {
  return {
    model,
    usage: {
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
    },
  };
}

interface FakeRun {
  durationMs: number;
  provider?: AIProviderEvidence;
}

/**
 * Builds an evaluation-evidence stand-in carrying only the fields the modelComparison
 * aggregator reads. The runner trusts `verify`'s output, so a structurally
 * minimal fake is enough to exercise the rollup without booting real agents.
 */
function fakeEvidence(input: {
  agentVersion?: string;
  passed: boolean;
  passRate: number | null;
  totalRuns: number;
  passedRuns: number;
  runs: FakeRun[];
  artifactId?: string;
}): AgentEvaluationEvidence {
  return {
    experiment: {
      agentVersion: input.agentVersion ?? "1.0.0",
      passed: input.passed,
      summary: {
        passRate: input.passRate,
        totalRuns: input.totalRuns,
        passedRuns: input.passedRuns,
      },
    },
    datasets: [
      {
        datasetRun: {
          runs: input.runs.map((run) => ({
            agentRun: {
              durationMs: run.durationMs,
              ...(run.provider ? { provider: run.provider } : {}),
            },
          })),
        },
      },
    ],
    artifactId: input.artifactId ?? "artifact-fake",
    artifactPath: "runs/fake.json",
  } as unknown as AgentEvaluationEvidence;
}

describe("runAgentModelComparison", () => {
  it("rolls up pass-rate, tokens, cost, and latency per model in order", async () => {
    const verify: ModelComparisonVerifier = async ({ model }) => {
      if (model === "gpt-5.4") {
        return fakeEvidence({
          agentVersion: "2.0.0",
          passed: true,
          passRate: 1,
          totalRuns: 2,
          passedRuns: 2,
          runs: [
            { durationMs: 1000, provider: usage("gpt-5.4", 100, 50) },
            { durationMs: 2000, provider: usage("gpt-5.4", 100, 50) },
          ],
          artifactId: "artifact-strong",
        });
      }
      return fakeEvidence({
        agentVersion: "2.0.0",
        passed: false,
        passRate: 0.5,
        totalRuns: 2,
        passedRuns: 1,
        runs: [
          { durationMs: 300, provider: usage("gpt-5.4-mini", 40, 20) },
          { durationMs: 500, provider: usage("gpt-5.4-mini", 40, 20) },
        ],
        artifactId: "artifact-weak",
      });
    };

    const modelComparison = await runAgentModelComparison(verify, {
      agentId: "project-intake",
      models: ["gpt-5.4", "gpt-5.4-mini"],
    });

    expect(agentModelComparisonSchema.safeParse(modelComparison).success).toBe(true);
    expect(modelComparison.agentVersion).toBe("2.0.0");
    expect(modelComparison.cells.map((cell) => cell.model)).toEqual([
      "gpt-5.4",
      "gpt-5.4-mini",
    ]);

    const strong = modelComparison.cells[0]!;
    const weak = modelComparison.cells[1]!;
    expect(strong.status).toBe("ok");
    expect(strong.passed).toBe(true);
    expect(strong.passRate).toBe(1);
    expect(strong.totalRuns).toBe(2);
    expect(strong.totalTokens).toBe(300);
    expect(strong.avgTokensPerRun).toBe(150);
    expect(strong.avgLatencyMs).toBe(1500);
    expect(strong.evaluationArtifactId).toBe("artifact-strong");
    // gpt-5.4 is in the pricing table, so a real cost lands on the badge.
    expect(strong.estimatedCostUsd).toBeGreaterThan(0);

    expect(weak.status).toBe("ok");
    expect(weak.passed).toBe(false);
    expect(weak.passRate).toBe(0.5);
    expect(weak.totalTokens).toBe(120);
    expect(weak.avgLatencyMs).toBe(400);
    expect(weak.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("reports null token/cost fields when a model yields no usage evidence", async () => {
    const verify: ModelComparisonVerifier = async () =>
      fakeEvidence({
        passed: true,
        passRate: 1,
        totalRuns: 2,
        passedRuns: 2,
        runs: [{ durationMs: 700 }, { durationMs: 900 }],
      });

    const modelComparison = await runAgentModelComparison(verify, {
      agentId: "project-intake",
      models: ["mystery-model"],
    });

    const cell = modelComparison.cells[0]!;
    expect(cell.status).toBe("ok");
    expect(cell.totalTokens).toBeNull();
    expect(cell.avgTokensPerRun).toBeNull();
    expect(cell.estimatedCostUsd).toBeNull();
    // Latency is timed by the harness, so it survives missing token usage.
    expect(cell.avgLatencyMs).toBe(800);
  });

  it("isolates a failing model as an error cell without aborting the modelComparison", async () => {
    const verify: ModelComparisonVerifier = async ({ model }) => {
      if (model === "broken") {
        throw new Error("OPENAI_API_KEY is missing for broken");
      }
      return fakeEvidence({
        passed: true,
        passRate: 1,
        totalRuns: 1,
        passedRuns: 1,
        runs: [{ durationMs: 100, provider: usage("gpt-5.4", 10, 5) }],
      });
    };

    const modelComparison = await runAgentModelComparison(verify, {
      agentId: "project-intake",
      models: ["broken", "gpt-5.4"],
    });

    const broken = modelComparison.cells[0]!;
    const working = modelComparison.cells[1]!;
    expect(broken.status).toBe("error");
    expect(broken.error).toContain("missing for broken");
    expect(broken.passed).toBe(false);
    expect(broken.evaluationArtifactId).toBeNull();
    expect(working.status).toBe("ok");
    // agentVersion is taken from the first model that actually ran.
    expect(modelComparison.agentVersion).toBe("1.0.0");
  });

  it("deduplicates repeated models while preserving first-seen order", async () => {
    const seen: string[] = [];
    const verify: ModelComparisonVerifier = async ({ model }) => {
      seen.push(model);
      return fakeEvidence({
        passed: true,
        passRate: 1,
        totalRuns: 1,
        passedRuns: 1,
        runs: [{ durationMs: 100, provider: usage("gpt-5.4", 10, 5) }],
      });
    };

    const modelComparison = await runAgentModelComparison(verify, {
      agentId: "project-intake",
      models: ["a", "b", "a"],
    });

    expect(seen).toEqual(["a", "b"]);
    expect(modelComparison.models).toEqual(["a", "b"]);
    expect(modelComparison.cells).toHaveLength(2);
  });

  it("threads execution options into each verify call", async () => {
    const requests: Array<{
      repetitions: number | undefined;
      concurrency: number | undefined;
    }> = [];
    const verify: ModelComparisonVerifier = async (request) => {
      requests.push({
        repetitions: request.repetitions,
        concurrency: request.concurrency,
      });
      return fakeEvidence({
        passed: true,
        passRate: 1,
        totalRuns: 1,
        passedRuns: 1,
        runs: [{ durationMs: 100, provider: usage("gpt-5.4", 10, 5) }],
      });
    };

    const modelComparison = await runAgentModelComparison(verify, {
      agentId: "project-intake",
      models: ["gpt-5.4"],
      repetitions: 3,
      concurrency: 2,
    });

    expect(modelComparison.execution).toEqual({ repetitions: 3, concurrency: 2 });
    expect(requests[0]).toEqual({ repetitions: 3, concurrency: 2 });
  });
});

describe("formatModelComparisonCell", () => {
  it("renders a passing cell with its badge metrics", () => {
    const line = formatModelComparisonCell({
      model: "gpt-5.4",
      status: "ok",
      passed: true,
      passRate: 1,
      totalRuns: 2,
      passedRuns: 2,
      totalTokens: 300,
      avgTokensPerRun: 150,
      estimatedCostUsd: 0.0123,
      avgLatencyMs: 1500,
      evaluationArtifactId: "artifact-strong",
      error: null,
    });

    expect(line).toContain("gpt-5.4");
    expect(line).toContain("pass");
    expect(line).toContain("passRate=100%");
    expect(line).toContain("tokens=300");
    expect(line).toContain("cost=$0.0123");
    expect(line).toContain("latency=1500ms");
  });

  it("renders an error cell with its message", () => {
    const line = formatModelComparisonCell({
      model: "broken",
      status: "error",
      passed: false,
      passRate: null,
      totalRuns: 0,
      passedRuns: 0,
      totalTokens: null,
      avgTokensPerRun: null,
      estimatedCostUsd: null,
      avgLatencyMs: null,
      evaluationArtifactId: null,
      error: "no API key",
    });

    expect(line).toContain("broken");
    expect(line).toContain("error");
    expect(line).toContain("no API key");
  });
});
