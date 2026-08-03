import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type {
  BuiltAgentCandidate,
} from "../src/agents/agentImprovement/agentCandidateBuilder.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { toolBuilderDataset } from "../src/agents/datasets/toolBuilderDataset.js";
import { createFrozenAgentCandidateEvaluationPlan } from "../src/agents/evaluations/agentCandidateEvaluationPlan.js";
import { runFrozenAgentCandidateEvaluation } from "../src/agents/evaluations/agentCandidateEvaluationRunner.js";
import { agentCandidateEvaluationArtifactSchema } from "../src/agents/evaluations/agentCandidateEvaluationArtifact.js";
import { evaluateAgentCandidatePromotionGates } from "../src/agents/evaluations/agentCandidatePromotionGates.js";
import { toolBuilderAgent } from "../src/agents/toolBuilder/toolBuilderAgent.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { persistAgentCandidateEvaluation } from "../src/artifacts/agentCandidateEvaluationPersistence.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { presentArtifact } from "../src/presentation/artifactPresenter.js";

const baseline = defineAgent({
  manifest: toolBuilderAgent.manifest,
  inputSchema: z.json(),
  outputSchema: z.object({ answer: z.string() }).strict(),
  async execute() {
    return { answer: "Baseline answer." };
  },
  assess(output) {
    const parsed = z.object({ answer: z.string() }).parse(output);
    const passed = parsed.answer.startsWith("Cited:");
    return {
      passed,
      message: passed ? "Answer cited evidence." : "Answer omitted citations.",
    };
  },
  assessDatasetCase(_input, output) {
    const parsed = z.object({ answer: z.string() }).parse(output);
    const passed = parsed.answer.startsWith("Cited:");
    return {
      passed,
      message: passed ? "Answer cited evidence." : "Answer omitted citations.",
    };
  },
});

const dataset = toolBuilderDataset;

function candidate(): BuiltAgentCandidate {
  return {
    evidence: {
      identity: {
        subjectAgentId: "tool-builder",
        baseVersion: "0.1.0",
        candidateId: "00000000-0000-4000-8000-000000000001",
        proposalId: "proposal-1",
        baselinePolicyDigest: "a".repeat(64),
        effectivePolicyDigest: "b".repeat(64),
      },
      changedFields: ["instructions"],
      baselinePolicy: { instructions: "Use supplied evidence." },
      effectivePolicy: { instructions: "Cite supplied evidence." },
    },
    registration: {
      ...baseline,
      assess: baseline.assess,
      ...(baseline.assessDatasetCase
        ? { assessDatasetCase: baseline.assessDatasetCase }
        : {}),
      async execute() {
        return { answer: "Cited: supplied evidence." };
      },
    },
  };
}

describe("createFrozenAgentCandidateEvaluationPlan", () => {
  it("freezes one comparable dataset and grader boundary", () => {
    const plan = createFrozenAgentCandidateEvaluationPlan({
      baselineRegistration: baseline,
      candidate: candidate(),
      datasets: [dataset],
      workspaceId: "workspace-1",
      model: "test-model",
      execution: { repetitions: 3, concurrency: 2 },
      planId: "00000000-0000-4000-8000-000000000010",
    });
    const repeated = createFrozenAgentCandidateEvaluationPlan({
      baselineRegistration: baseline,
      candidate: candidate(),
      datasets: [dataset],
      workspaceId: "workspace-1",
      model: "test-model",
      execution: { repetitions: 3, concurrency: 2 },
      planId: "00000000-0000-4000-8000-000000000011",
    });

    expect(plan.evidence).toMatchObject({
      graderBoundary: {
        outputAssessment: "baseline-registration",
        datasetCaseAssessment: "baseline-registration",
      },
      execution: { repetitions: 3, concurrency: 2 },
      datasets: [{
        datasetId: "tool-builder-smoke",
        purpose: "regression",
        caseIds: dataset.cases.map(({ id }) => id),
      }],
    });
    expect(plan.evidence.planDigest).toBe(repeated.evidence.planDigest);
    expect(plan.evidence.datasets[0]?.datasetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(plan.evidence)).toBe(true);
    expect(Object.isFrozen(plan.datasets[0]?.cases)).toBe(true);
  });

  it("copies dataset content before freezing the execution plan", () => {
    const mutableDataset = structuredClone(dataset);
    const originalInput = structuredClone(mutableDataset.cases[0]!.input);
    const plan = createFrozenAgentCandidateEvaluationPlan({
      baselineRegistration: baseline,
      candidate: candidate(),
      datasets: [mutableDataset],
      workspaceId: "workspace-1",
      model: "test-model",
      planId: "00000000-0000-4000-8000-000000000010",
    });

    mutableDataset.cases[0]!.input = { request: "Mutated later." };
    expect(plan.datasets[0]?.cases[0]?.input).toEqual(originalInput);
  });

  it("rejects dataset, subject, and grader drift", () => {
    expect(() =>
      createFrozenAgentCandidateEvaluationPlan({
        baselineRegistration: baseline,
        candidate: candidate(),
        datasets: [],
        workspaceId: "workspace-1",
        model: "test-model",
      })
    ).toThrow("do not match the released verification manifest");

    const wrongSubject = candidate();
    wrongSubject.evidence.identity.subjectAgentId = "other-agent";
    expect(() =>
      createFrozenAgentCandidateEvaluationPlan({
        baselineRegistration: baseline,
        candidate: wrongSubject,
        datasets: [dataset],
        workspaceId: "workspace-1",
        model: "test-model",
      })
    ).toThrow("does not match the baseline subject");

    const changedGrader = candidate();
    changedGrader.registration.assess = () => ({
      passed: false,
      message: "Changed grader.",
    });
    expect(() =>
      createFrozenAgentCandidateEvaluationPlan({
        baselineRegistration: baseline,
        candidate: changedGrader,
        datasets: [dataset],
        workspaceId: "workspace-1",
        model: "test-model",
      })
    ).toThrow("graders do not match");
  });

  it("executes both sides from the frozen plan and records candidate lineage", async () => {
    const plan = createFrozenAgentCandidateEvaluationPlan({
      baselineRegistration: baseline,
      candidate: candidate(),
      datasets: [dataset],
      workspaceId: "workspace-1",
      model: "test-model",
      execution: { repetitions: 2, concurrency: 2 },
      planId: "00000000-0000-4000-8000-000000000010",
    });

    const result = await runFrozenAgentCandidateEvaluation({
      plan,
      tools: new ToolRegistry([]),
      providerFactory: () => new FakeProvider("unused"),
      workspaceRoot: "/workspace",
    });

    expect(result.baseline.experiment.candidate).toBeUndefined();
    expect(result.candidate.experiment.candidate).toEqual(
      plan.evidence.candidate,
    );
    const candidateRuns = result.candidate.datasetRuns[0]?.runs ?? [];
    expect(candidateRuns).toHaveLength(dataset.cases.length * 2);
    expect(
      candidateRuns.every(
        ({ agentRun }) =>
          JSON.stringify(agentRun.candidate) ===
            JSON.stringify(plan.evidence.candidate),
      ),
    ).toBe(true);
    expect(result.comparison.summary).toMatchObject({
      improvedCases: dataset.cases.length,
      regressedCases: 0,
    });
    expect(result.baseline.datasetRuns[0]?.runs[0]?.agentRun.input).toEqual(
      result.candidate.datasetRuns[0]?.runs[0]?.agentRun.input,
    );
    const gates = evaluateAgentCandidatePromotionGates(result, {
      maximumLatencyRegressionRatio: 1_000_000_000,
    });
    expect(gates).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gateId: "completeness", status: "passed" }),
        expect.objectContaining({ gateId: "scope", status: "passed" }),
        expect.objectContaining({ gateId: "regression", status: "passed" }),
        expect.objectContaining({
          gateId: "protected",
          status: "not-applicable",
        }),
        expect.objectContaining({ gateId: "improvement", status: "passed" }),
        expect.objectContaining({ gateId: "cost", status: "not-applicable" }),
      ]),
    });

    const regressed = structuredClone(result);
    regressed.comparison.cases[0]!.classification = "regressed";
    expect(
      evaluateAgentCandidatePromotionGates(regressed).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "regression", status: "failed" }),
    );

    const incomplete = structuredClone(result);
    incomplete.comparison.cases.pop();
    expect(
      evaluateAgentCandidatePromotionGates(incomplete).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "completeness", status: "failed" }),
    );

    const scopeDrift = structuredClone(result);
    delete scopeDrift.candidate.datasetRuns[0]!.runs[0]!.agentRun.candidate;
    expect(
      evaluateAgentCandidatePromotionGates(scopeDrift).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "scope", status: "failed" }),
    );

    const latencyRegression = structuredClone(result);
    for (const run of latencyRegression.baseline.datasetRuns[0]!.runs) {
      run.agentRun.durationMs = 1;
    }
    for (const run of latencyRegression.candidate.datasetRuns[0]!.runs) {
      run.agentRun.durationMs = 2;
    }
    expect(
      evaluateAgentCandidatePromotionGates(latencyRegression, {
        maximumLatencyRegressionRatio: 0,
      }).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "latency", status: "failed" }),
    );

    const protectedExecution = structuredClone(result);
    protectedExecution.plan = {
      ...protectedExecution.plan,
      datasets: protectedExecution.plan.datasets.map((plannedDataset) => ({
        ...plannedDataset,
        purpose: "protected" as const,
        minimumPassRate: 1,
      })),
    };
    expect(
      evaluateAgentCandidatePromotionGates(protectedExecution, {
        maximumLatencyRegressionRatio: 1_000_000_000,
      }).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "protected", status: "passed" }),
    );
    protectedExecution.comparison.cases[0]!.candidatePassRate = 0;
    expect(
      evaluateAgentCandidatePromotionGates(protectedExecution, {
        maximumLatencyRegressionRatio: 1_000_000_000,
      }).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "protected", status: "failed" }),
    );

    const withUsage = structuredClone(result);
    const assignUsage = (
      side: typeof withUsage.baseline,
      totalTokens: number,
    ) => {
      for (const datasetRun of side.datasetRuns) {
        for (const run of datasetRun.runs) {
          run.agentRun.provider = {
            model: "gpt-5.4-mini",
            usage: {
              inputTokens: totalTokens,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              totalTokens,
            },
          };
        }
      }
    };
    assignUsage(withUsage.baseline, 100);
    assignUsage(withUsage.candidate, 100);
    expect(
      evaluateAgentCandidatePromotionGates(withUsage, {
        maximumLatencyRegressionRatio: 1_000_000_000,
        maximumCostRegressionRatio: 0.25,
      }).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "cost", status: "passed" }),
    );
    assignUsage(withUsage.candidate, 200);
    expect(
      evaluateAgentCandidatePromotionGates(withUsage, {
        maximumLatencyRegressionRatio: 1_000_000_000,
        maximumCostRegressionRatio: 0.25,
      }).results,
    ).toContainEqual(
      expect.objectContaining({ gateId: "cost", status: "failed" }),
    );

    const store = new FileArtifactStore(
      await mkdtemp(join(tmpdir(), "candidate-evaluation-")),
    );
    const persisted = await persistAgentCandidateEvaluation(store, result, {
      candidateEvaluationId: "00000000-0000-4000-8000-000000000020",
      completedAt: "2026-08-03T22:00:00.000Z",
      gatePolicy: {
        maximumLatencyRegressionRatio: 1_000_000_000,
      },
    });
    const loaded = await store.load(persisted.reference.id);

    expect(persisted.datasetRunReferences).toHaveLength(2);
    expect(loaded).toEqual({
      kind: "agent-candidate-evaluation",
      artifact: persisted.artifact,
    });
    expect(
      (await store.list({ kind: "agent-candidate-evaluation" })).artifacts,
    ).toEqual([
      expect.objectContaining({
        id: persisted.artifact.candidateEvaluationId,
        agentId: "tool-builder",
        succeeded: true,
      }),
    ]);
    expect(presentArtifact(persisted.reference.id, loaded)).toMatchObject({
      artifactKind: "agent-candidate-evaluation",
      succeeded: true,
    });
    expect(() =>
      agentCandidateEvaluationArtifactSchema.parse({
        ...persisted.artifact,
        candidate: {
          ...persisted.artifact.candidate,
          experimentArtifactId:
            persisted.artifact.baseline.experimentArtifactId,
        },
      })
    ).toThrow("Candidate reference does not match comparison evidence");
  });
});
