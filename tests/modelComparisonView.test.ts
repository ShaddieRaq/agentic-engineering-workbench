import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildModelComparisonIndex,
  buildModelComparisonView,
} from "../src/web/modelComparisonView.js";

const MODEL_COMPARISON_A = "11111111-1111-1111-1111-111111111111";
const MODEL_COMPARISON_B = "22222222-2222-2222-2222-222222222222";

function okCell(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    status: "ok",
    passed: false,
    passRate: 0.5,
    totalRuns: 8,
    passedRuns: 4,
    totalTokens: 1000,
    avgTokensPerRun: 125,
    estimatedCostUsd: 0.1,
    avgLatencyMs: 1000,
    evaluationArtifactId: "eval",
    error: null,
    ...overrides,
  };
}

describe("model comparison eval view-model", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "model-comparison-view-"));
    const modelComparisonA = {
      modelComparisonId: MODEL_COMPARISON_A,
      agentId: "project-intake",
      agentVersion: "0.6.0",
      execution: { repetitions: 1, concurrency: 1 },
      models: ["gpt-5.4", "gpt-5.4-mini"],
      completedAt: "2026-08-11T23:41:51.332Z",
      cells: [
        okCell({
          model: "gpt-5.4",
          passed: true,
          passRate: 1,
          passedRuns: 8,
          estimatedCostUsd: 0.23,
          avgLatencyMs: 17494,
          evaluationArtifactId: "eval-a",
        }),
        okCell({
          model: "gpt-5.4-mini",
          passed: false,
          passRate: 0.75,
          passedRuns: 6,
          estimatedCostUsd: 0.06,
          avgLatencyMs: 15648,
          evaluationArtifactId: "eval-b",
        }),
      ],
    };
    const triageA = {
      modelComparisonId: MODEL_COMPARISON_A,
      agentId: "project-intake",
      modelsConsidered: ["gpt-5.4", "gpt-5.4-mini"],
      meaningful: true,
      ambiguity: [
        {
          datasetId: "project-intake-smoke",
          caseId: "contradiction-is-surfaced",
          failedModels: ["gpt-5.4", "gpt-5.4-mini"],
          passedModels: [],
          classification: "ambiguity",
          worstFailurePassRate: 0,
          marginal: false,
        },
      ],
      capabilityDependent: [
        {
          datasetId: "project-intake-smoke",
          caseId: "hard-case",
          failedModels: ["gpt-5.4-mini"],
          passedModels: ["gpt-5.4"],
          classification: "capability-dependent",
          worstFailurePassRate: 0.5,
          marginal: false,
        },
      ],
    };
    // ModelComparison B: an error cell, a null agentVersion, and NO triage sibling.
    const modelComparisonB = {
      modelComparisonId: MODEL_COMPARISON_B,
      agentId: "test-designer",
      agentVersion: null,
      execution: { repetitions: 2, concurrency: 1 },
      models: ["gpt-5.4", "broken-model"],
      completedAt: "2026-08-12T00:00:00.000Z",
      cells: [
        okCell({ model: "gpt-5.4", passed: true, passRate: 1, passedRuns: 8 }),
        {
          model: "broken-model",
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
          error: "model key missing",
        },
      ],
    };
    await writeFile(join(directory, `model-comparison-${MODEL_COMPARISON_A}.json`), JSON.stringify(modelComparisonA));
    await writeFile(join(directory, `model-comparison-triage-${MODEL_COMPARISON_A}.json`), JSON.stringify(triageA));
    await writeFile(join(directory, `model-comparison-${MODEL_COMPARISON_B}.json`), JSON.stringify(modelComparisonB));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("flags the winning cell per dimension and folds in triage", async () => {
    const view = await buildModelComparisonView(directory, MODEL_COMPARISON_A);
    if (!view) throw new Error("expected a modelComparison view");

    expect(view.agentVersion).toBe("0.6.0");
    const [strong, mini] = view.cells;
    expect(strong!.verdict).toBe("pass");
    expect(strong!.bestReliability).toBe(true);
    expect(strong!.lowestCost).toBe(false);
    // The strong model is most reliable; the mini is cheapest AND fastest —
    // the trade-off the operator has to read, encoded as separate flags.
    expect(mini!.verdict).toBe("fail");
    expect(mini!.bestReliability).toBe(false);
    expect(mini!.lowestCost).toBe(true);
    expect(mini!.lowestLatency).toBe(true);

    expect(view.summary.modelsPassing).toBe(1);
    expect(view.summary.modelsFailing).toBe(1);
    expect(view.summary.passRateSpread).toBeCloseTo(0.25);
    expect(view.summary.ambiguityCount).toBe(1);
    expect(view.summary.capabilityDependentCount).toBe(1);
    expect(view.triage?.ambiguity[0]?.classification).toBe("ambiguity");
  });

  it("marks error cells and stands without a triage sibling", async () => {
    const view = await buildModelComparisonView(directory, MODEL_COMPARISON_B);
    if (!view) throw new Error("expected a modelComparison view");

    expect(view.agentVersion).toBeNull();
    const errored = view.cells.find((cell) => cell.model === "broken-model");
    expect(errored?.verdict).toBe("error");
    expect(errored?.bestReliability).toBe(false);
    expect(view.summary.modelsErrored).toBe(1);
    expect(view.triage).toBeNull();
    expect(view.summary.ambiguityCount).toBe(0);
  });

  it("returns null for an unknown modelComparison id", async () => {
    expect(await buildModelComparisonView(directory, "does-not-exist")).toBeNull();
  });

  it("indexes every modelComparison newest-first with a triage flag", async () => {
    const index = await buildModelComparisonIndex(directory);
    expect(index.modelComparisons).toHaveLength(2);

    const a = index.modelComparisons.find((entry) => entry.modelComparisonId === MODEL_COMPARISON_A);
    const b = index.modelComparisons.find((entry) => entry.modelComparisonId === MODEL_COMPARISON_B);
    expect(a?.hasTriage).toBe(true);
    expect(a?.modelsPassing).toBe(1);
    expect(b?.hasTriage).toBe(false);
  });

  it("returns an empty index when the directory has no modelComparisons", async () => {
    const empty = await mkdtemp(join(tmpdir(), "model-comparison-empty-"));
    try {
      expect((await buildModelComparisonIndex(empty)).modelComparisons).toHaveLength(0);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
