import { describe, expect, it } from "vitest";
import {
  agentModelComparisonSchema,
  type AgentModelComparison,
} from "../src/agents/modelComparison/agentModelComparison.js";
import { renderModelComparisonMarkdown } from "../src/agents/modelComparison/agentModelComparisonReport.js";

function modelComparison(cells: AgentModelComparison["cells"]): AgentModelComparison {
  return agentModelComparisonSchema.parse({
    modelComparisonId: "11111111-1111-1111-1111-111111111111",
    agentId: "project-intake",
    agentVersion: "0.6.0",
    execution: { repetitions: 1, concurrency: 1 },
    models: cells.map((cell) => cell.model),
    cells,
    completedAt: "2026-08-11T23:00:00.000Z",
  });
}

function okCell(
  model: string,
  passed: boolean,
  overrides: Partial<AgentModelComparison["cells"][number]> = {},
): AgentModelComparison["cells"][number] {
  return {
    model,
    status: "ok",
    passed,
    passRate: passed ? 1 : 0.875,
    totalRuns: 8,
    passedRuns: passed ? 8 : 7,
    totalTokens: 25000,
    avgTokensPerRun: 3125,
    estimatedCostUsd: 0.2325,
    avgLatencyMs: 17495,
    evaluationArtifactId: `artifact-${model}`,
    error: null,
    ...overrides,
  };
}

describe("renderModelComparisonMarkdown", () => {
  it("renders a header, a row per model, and the badge metrics", () => {
    const md = renderModelComparisonMarkdown(
      modelComparison([
        okCell("gpt-5.4", true),
        okCell("gpt-5.4-mini", false, {
          estimatedCostUsd: 0.0619,
          avgLatencyMs: 15648,
        }),
      ]),
    );

    expect(md).toContain("# Model Comparison Eval — project-intake@0.6.0");
    expect(md).toContain("| gpt-5.4 | ✓ pass | 100% | 8 |");
    expect(md).toContain("| gpt-5.4-mini | ✗ FAIL | 88% | 8 |");
    expect(md).toContain("$0.2325");
    expect(md).toContain("17495 ms");
    expect(md).toContain("2 model(s) compared");
  });

  it("names the cheapest passing model", () => {
    const md = renderModelComparisonMarkdown(
      modelComparison([
        okCell("gpt-5.4", true, { estimatedCostUsd: 0.2325 }),
        okCell("gpt-5.4-mini", true, { estimatedCostUsd: 0.0619 }),
      ]),
    );
    expect(md).toContain("Cheapest passing model: **gpt-5.4-mini** at $0.0619");
  });

  it("states honestly when no model passed", () => {
    const md = renderModelComparisonMarkdown(
      modelComparison([okCell("gpt-5.4", false), okCell("gpt-5.4-mini", false)]),
    );
    expect(md).toContain("No model passed the verification gate");
  });

  it("renders null token/cost/latency as n/a and surfaces error cells", () => {
    const md = renderModelComparisonMarkdown(
      modelComparison([
        okCell("mystery", true, {
          totalTokens: null,
          avgTokensPerRun: null,
          estimatedCostUsd: null,
          avgLatencyMs: null,
        }),
        {
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
          error: "OPENAI_API_KEY missing",
        },
      ]),
    );

    expect(md).toContain("| mystery | ✓ pass | 100% | 8 | n/a | n/a | n/a | n/a |");
    expect(md).toContain("| broken | error |");
    expect(md).toContain("`broken` did not run: OPENAI_API_KEY missing");
  });
});
