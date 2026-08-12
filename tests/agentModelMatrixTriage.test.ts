import { describe, expect, it } from "vitest";
import {
  agentModelMatrixSchema,
  type AgentModelMatrix,
} from "../src/agents/modelMatrix/agentModelMatrix.js";
import {
  renderModelMatrixTriageMarkdown,
  triageModelMatrix,
  type ModelCaseFailures,
} from "../src/agents/modelMatrix/agentModelMatrixTriage.js";

function matrixOf(models: string[]): AgentModelMatrix {
  return agentModelMatrixSchema.parse({
    matrixId: "22222222-2222-2222-2222-222222222222",
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

const fail = (datasetId: string, caseId: string) => ({ datasetId, caseId });

describe("triageModelMatrix", () => {
  it("classifies a case that fails on every model as ambiguity", () => {
    const failures: ModelCaseFailures[] = [
      { model: "gpt-5.4", failedCases: [fail("intake-smoke", "contradiction")] },
      { model: "gpt-5.4-mini", failedCases: [fail("intake-smoke", "contradiction")] },
    ];

    const triage = triageModelMatrix(matrixOf(["gpt-5.4", "gpt-5.4-mini"]), failures);

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

    const triage = triageModelMatrix(matrixOf(["gpt-5.4", "gpt-5.4-mini"]), failures);

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

    const triage = triageModelMatrix(matrixOf(["a", "b"]), failures);

    // ds1/x failed on both -> ambiguity; ds2/x failed only on a -> capability-dependent
    expect(triage.ambiguity.map((c) => `${c.datasetId}/${c.caseId}`)).toEqual(["ds1/x"]);
    expect(triage.capabilityDependent.map((c) => `${c.datasetId}/${c.caseId}`)).toEqual(["ds2/x"]);
  });

  it("marks a single-model matrix as not meaningful", () => {
    const failures: ModelCaseFailures[] = [
      { model: "solo", failedCases: [fail("ds", "c")] },
    ];
    const triage = triageModelMatrix(matrixOf(["solo"]), failures);
    expect(triage.meaningful).toBe(false);
    // with one model, a failure trivially "fails on all" -> ambiguity bucket
    expect(triage.ambiguity).toHaveLength(1);
  });

  it("produces no triaged cases when nothing failed", () => {
    const failures: ModelCaseFailures[] = [
      { model: "a", failedCases: [] },
      { model: "b", failedCases: [] },
    ];
    const triage = triageModelMatrix(matrixOf(["a", "b"]), failures);
    expect(triage.ambiguity).toHaveLength(0);
    expect(triage.capabilityDependent).toHaveLength(0);
  });
});

describe("renderModelMatrixTriageMarkdown", () => {
  it("renders both sections and the one-model caveat", () => {
    const triage = triageModelMatrix(matrixOf(["solo"]), [
      { model: "solo", failedCases: [fail("ds", "c")] },
    ]);
    const md = renderModelMatrixTriageMarkdown(triage);
    expect(md).toContain("# Model Matrix Triage — project-intake");
    expect(md).toContain("Triage needs at least two models");
    expect(md).toContain("Ambiguity — prompt/gate-hardening targets (1)");
    expect(md).toContain("`ds / c` — failed on: solo");
  });

  it("states 'None' in an empty section", () => {
    const triage = triageModelMatrix(matrixOf(["a", "b"]), [
      { model: "a", failedCases: [] },
      { model: "b", failedCases: [fail("ds", "c")] },
    ]);
    const md = renderModelMatrixTriageMarkdown(triage);
    expect(md).toContain("Ambiguity — prompt/gate-hardening targets (0)");
    expect(md).toContain("None — no case failed across every model.");
    expect(md).toContain("Capability-dependent — model-selection signals (1)");
  });
});
