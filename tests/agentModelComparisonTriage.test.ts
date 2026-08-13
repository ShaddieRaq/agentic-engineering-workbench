import { describe, expect, it } from "vitest";
import {
  agentModelComparisonSchema,
  type AgentModelComparison,
} from "../src/agents/modelComparison/agentModelComparison.js";
import {
  renderModelComparisonTriageMarkdown,
  triageModelComparison,
  type ModelCaseFailures,
} from "../src/agents/modelComparison/agentModelComparisonTriage.js";

function modelComparisonOf(models: string[]): AgentModelComparison {
  return agentModelComparisonSchema.parse({
    modelComparisonId: "22222222-2222-2222-2222-222222222222",
    agentId: "project-intake",
    agentVersion: "0.6.0",
    execution: { repetitions: 3, concurrency: 1 },
    models,
    cells: models.map((model) => ({
      model,
      status: "ok",
      passed: false,
      passRate: 0.9,
      totalRuns: 3,
      passedRuns: 2,
      totalTokens: 100,
      avgTokensPerRun: 33,
      estimatedCostUsd: 0.01,
      avgLatencyMs: 500,
      evaluationArtifactId: `artifact-${model}`,
      error: null,
    })),
    completedAt: "2026-08-11T23:00:00.000Z",
  });
}

const fail = (datasetId: string, caseId: string, passRate = 0) => ({
  datasetId,
  caseId,
  passRate,
});

describe("triageModelComparison", () => {
  it("classifies a case that fails on every model as ambiguity", () => {
    const failures: ModelCaseFailures[] = [
      { model: "gpt-5.4", failedCases: [fail("intake-smoke", "contradiction")] },
      { model: "gpt-5.4-mini", failedCases: [fail("intake-smoke", "contradiction")] },
    ];

    const triage = triageModelComparison(modelComparisonOf(["gpt-5.4", "gpt-5.4-mini"]), failures);

    expect(triage.meaningful).toBe(true);
    expect(triage.ambiguity).toHaveLength(1);
    expect(triage.capabilityDependent).toHaveLength(0);
    const [amb] = triage.ambiguity;
    expect(amb!.caseId).toBe("contradiction");
    expect(amb!.failedModels).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(amb!.passedModels).toEqual([]);
  });

  it("classifies a case that passes on the strong model as capability-dependent", () => {
    const failures: ModelCaseFailures[] = [
      { model: "gpt-5.4", failedCases: [] },
      { model: "gpt-5.4-mini", failedCases: [fail("intake-smoke", "hard-case")] },
    ];

    const triage = triageModelComparison(modelComparisonOf(["gpt-5.4", "gpt-5.4-mini"]), failures);

    expect(triage.ambiguity).toHaveLength(0);
    expect(triage.capabilityDependent).toHaveLength(1);
    const [cap] = triage.capabilityDependent;
    expect(cap!.failedModels).toEqual(["gpt-5.4-mini"]);
    expect(cap!.passedModels).toEqual(["gpt-5.4"]);
    expect(cap!.classification).toBe("capability-dependent");
  });

  it("keys cases by (datasetId, caseId) so same caseId in different datasets is distinct", () => {
    const failures: ModelCaseFailures[] = [
      { model: "a", failedCases: [fail("ds1", "x"), fail("ds2", "x")] },
      { model: "b", failedCases: [fail("ds1", "x")] },
    ];

    const triage = triageModelComparison(modelComparisonOf(["a", "b"]), failures);

    // ds1/x failed on both -> ambiguity; ds2/x failed only on a -> capability-dependent
    expect(triage.ambiguity.map((c) => `${c.datasetId}/${c.caseId}`)).toEqual(["ds1/x"]);
    expect(triage.capabilityDependent.map((c) => `${c.datasetId}/${c.caseId}`)).toEqual(["ds2/x"]);
  });

  it("marks a single-model comparison eval as not meaningful", () => {
    const failures: ModelCaseFailures[] = [
      { model: "solo", failedCases: [fail("ds", "c")] },
    ];
    const triage = triageModelComparison(modelComparisonOf(["solo"]), failures);
    expect(triage.meaningful).toBe(false);
    // with one model, a failure trivially "fails on all" -> ambiguity bucket
    expect(triage.ambiguity).toHaveLength(1);
  });

  it("flags a marginal ambiguity case where a failing model partially passed", () => {
    const failures: ModelCaseFailures[] = [
      { model: "gpt-5.4", failedCases: [fail("ds", "flaky", 0.67)] },
      { model: "gpt-5.4-mini", failedCases: [fail("ds", "flaky", 0.33)] },
    ];
    const triage = triageModelComparison(modelComparisonOf(["gpt-5.4", "gpt-5.4-mini"]), failures);
    const [c] = triage.ambiguity;
    expect(c!.marginal).toBe(true);
    expect(c!.worstFailurePassRate).toBe(0.67);
  });

  it("does not flag a hard failure (all failing models scored 0) as marginal", () => {
    const failures: ModelCaseFailures[] = [
      { model: "gpt-5.4", failedCases: [fail("ds", "hard", 0)] },
      { model: "gpt-5.4-mini", failedCases: [fail("ds", "hard", 0)] },
    ];
    const triage = triageModelComparison(modelComparisonOf(["gpt-5.4", "gpt-5.4-mini"]), failures);
    const [c] = triage.ambiguity;
    expect(c!.marginal).toBe(false);
    expect(c!.worstFailurePassRate).toBe(0);
  });

  it("produces no triaged cases when nothing failed", () => {
    const failures: ModelCaseFailures[] = [
      { model: "a", failedCases: [] },
      { model: "b", failedCases: [] },
    ];
    const triage = triageModelComparison(modelComparisonOf(["a", "b"]), failures);
    expect(triage.ambiguity).toHaveLength(0);
    expect(triage.capabilityDependent).toHaveLength(0);
  });
});

describe("renderModelComparisonTriageMarkdown", () => {
  it("renders both sections and the one-model caveat", () => {
    const triage = triageModelComparison(modelComparisonOf(["solo"]), [
      { model: "solo", failedCases: [fail("ds", "c")] },
    ]);
    const md = renderModelComparisonTriageMarkdown(triage);
    expect(md).toContain("# Model Comparison Eval Triage — project-intake");
    expect(md).toContain("Triage needs at least two models");
    expect(md).toContain("Ambiguity — prompt/gate-hardening targets (1)");
    expect(md).toContain("`ds / c` — failed on: solo");
  });

  it("states 'None' in an empty section", () => {
    const triage = triageModelComparison(modelComparisonOf(["a", "b"]), [
      { model: "a", failedCases: [] },
      { model: "b", failedCases: [fail("ds", "c")] },
    ]);
    const md = renderModelComparisonTriageMarkdown(triage);
    expect(md).toContain("Ambiguity — prompt/gate-hardening targets (0)");
    expect(md).toContain("None — no case failed across every model.");
    expect(md).toContain("Capability-dependent — model-selection signals (1)");
  });

  it("warns when an ambiguity case is marginal (flaky)", () => {
    const triage = triageModelComparison(modelComparisonOf(["a", "b"]), [
      { model: "a", failedCases: [fail("ds", "flaky", 0.67)] },
      { model: "b", failedCases: [fail("ds", "flaky", 0.5)] },
    ]);
    const md = renderModelComparisonTriageMarkdown(triage);
    expect(md).toContain("1 of these are **marginal**");
    expect(md).toContain("MARGINAL (a failing model still scored 67%");
  });
});
