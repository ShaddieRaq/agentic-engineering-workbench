import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { BuiltAgentCandidate } from "../src/agents/agentImprovement/agentCandidateBuilder.js";
import { defineAgent } from "../src/agents/agentRegistration.js";
import { toolBuilderDataset } from "../src/agents/datasets/toolBuilderDataset.js";
import { createAgentCandidateEvaluationArtifact } from "../src/agents/evaluations/agentCandidateEvaluationArtifact.js";
import { createFrozenAgentCandidateEvaluationPlan } from "../src/agents/evaluations/agentCandidateEvaluationPlan.js";
import { runFrozenAgentCandidateEvaluation } from "../src/agents/evaluations/agentCandidateEvaluationRunner.js";
import {
  createAgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";
import { toolBuilderAgent } from "../src/agents/toolBuilder/toolBuilderAgent.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { presentArtifact } from "../src/presentation/artifactPresenter.js";
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

async function comparisonArtifact() {
  const plan = createFrozenAgentCandidateEvaluationPlan({
    baselineRegistration: baseline,
    candidate: candidate(),
    datasets: [toolBuilderDataset],
    workspaceId: "workspace-1",
    model: "test-model",
    execution: { repetitions: 1, concurrency: 1 },
    planId: "00000000-0000-4000-8000-000000000010",
  });
  const execution = await runFrozenAgentCandidateEvaluation({
    plan,
    tools: new ToolRegistry([]),
    providerFactory: () => new FakeProvider("unused"),
    workspaceRoot: "/workspace",
  });
  return createAgentCandidateEvaluationArtifact(execution, {
    candidateEvaluationId: "00000000-0000-4000-8000-000000000020",
    completedAt: "2026-08-03T22:00:00.000Z",
    gatePolicy: { maximumLatencyRegressionRatio: 1_000_000_000 },
  });
}

describe("createAgentPromotionDecision", () => {
  it("approves only when gates passed and emits a release task", async () => {
    const comparison = await comparisonArtifact();
    expect(comparison.gates.passed).toBe(true);

    const approved = createAgentPromotionDecision({
      comparison,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "The candidate improved every planned case without scope drift.",
      proposalArtifactId: "proposal-artifact-1",
      decisionId: "00000000-0000-4000-8000-000000000030",
      decidedAt: "2026-08-03T22:05:00.000Z",
    });

    expect(approved).toMatchObject({
      decision: "approve",
      candidateEvaluationArtifactId: comparison.candidateEvaluationId,
      proposalArtifactId: "proposal-artifact-1",
      gatesPassed: true,
      releaseTask: {
        kind: "source-controlled-agent-release",
        candidateId: comparison.plan.candidate.candidateId,
        effectivePolicyDigest:
          comparison.plan.candidate.effectivePolicyDigest,
      },
    });
    expect(approved.releaseTask?.requiredActions.length).toBeGreaterThan(0);

    const failedComparison = structuredClone(comparison);
    failedComparison.gates = {
      ...failedComparison.gates,
      passed: false,
      results: failedComparison.gates.results.map((result) =>
        result.gateId === "improvement"
          ? { ...result, status: "failed" as const, message: "No improvement." }
          : result
      ),
    };
    expect(() =>
      createAgentPromotionDecision({
        comparison: failedComparison,
        decision: "approve",
        operatorId: "operator-1",
        rationale: "Should be blocked.",
      })
    ).toThrow("failed promotion gates cannot be approved");
  });

  it("allows reject and revise without a release task", async () => {
    const comparison = await comparisonArtifact();
    const rejected = createAgentPromotionDecision({
      comparison,
      decision: "reject",
      operatorId: "operator-1",
      rationale: "Prefer a smaller instruction change.",
      decisionId: "00000000-0000-4000-8000-000000000031",
      decidedAt: "2026-08-03T22:06:00.000Z",
    });
    expect(rejected.releaseTask).toBeNull();

    const revise = createAgentPromotionDecision({
      comparison,
      decision: "revise",
      operatorId: "operator-1",
      rationale: "Request a narrower context-selection patch.",
    });
    expect(revise.decision).toBe("revise");
    expect(revise.releaseTask).toBeNull();
  });

  it("persists and presents an immutable promotion decision", async () => {
    const comparison = await comparisonArtifact();
    const decision = createAgentPromotionDecision({
      comparison,
      decision: "approve",
      operatorId: "operator-1",
      rationale: "Approve the bounded citation improvement.",
      decisionId: "00000000-0000-4000-8000-000000000032",
      decidedAt: "2026-08-03T22:07:00.000Z",
    });
    const store = new FileArtifactStore(
      await mkdtemp(join(tmpdir(), "promotion-decision-")),
    );
    const reference = await store.saveAgentPromotionDecision(decision);
    const loaded = await store.load(reference.id);

    expect(loaded).toEqual({
      kind: "agent-promotion-decision",
      artifact: decision,
    });
    expect(
      (await store.list({ kind: "agent-promotion-decision" })).artifacts,
    ).toEqual([
      expect.objectContaining({
        id: decision.decisionId,
        agentId: "tool-builder",
        succeeded: true,
      }),
    ]);
    expect(presentArtifact(reference.id, loaded)).toMatchObject({
      artifactKind: "agent-promotion-decision",
      succeeded: true,
      prioritizedActions: decision.releaseTask?.requiredActions,
    });
  });
});
