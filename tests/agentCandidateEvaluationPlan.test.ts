import { z } from "zod";
import { describe, expect, it } from "vitest";
import type {
  BuiltAgentCandidate,
} from "../src/agents/agentImprovement/agentCandidateBuilder.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { toolBuilderDataset } from "../src/agents/datasets/toolBuilderDataset.js";
import { createFrozenAgentCandidateEvaluationPlan } from "../src/agents/evaluations/agentCandidateEvaluationPlan.js";
import { runFrozenAgentCandidateEvaluation } from "../src/agents/evaluations/agentCandidateEvaluationRunner.js";
import { toolBuilderAgent } from "../src/agents/toolBuilder/toolBuilderAgent.js";
import { FakeProvider } from "../src/providers/fakeProvider.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

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
  });
});
