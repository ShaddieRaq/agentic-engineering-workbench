import { z } from "zod";
import type { BuiltAgentCandidate } from "../../src/agents/agentImprovement/agentCandidateBuilder.js";
import { defineAgent } from "../../src/agents/agentRegistration.js";
import { toolBuilderDataset } from "../../src/agents/datasets/toolBuilderDataset.js";
import {
  createAgentCandidateEvaluationArtifact,
  type AgentCandidateEvaluationArtifact,
} from "../../src/agents/evaluations/agentCandidateEvaluationArtifact.js";
import { createFrozenAgentCandidateEvaluationPlan } from "../../src/agents/evaluations/agentCandidateEvaluationPlan.js";
import { runFrozenAgentCandidateEvaluation } from "../../src/agents/evaluations/agentCandidateEvaluationRunner.js";
import { toolBuilderAgent } from "../../src/agents/toolBuilder/toolBuilderAgent.js";
import { FakeProvider } from "../../src/providers/fakeProvider.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";

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

export async function createPassingCandidateComparison(
  options: {
    candidateEvaluationId?: string;
    completedAt?: string;
  } = {},
): Promise<AgentCandidateEvaluationArtifact> {
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
    candidateEvaluationId:
      options.candidateEvaluationId ??
      "00000000-0000-4000-8000-000000000020",
    completedAt: options.completedAt ?? "2026-08-03T22:00:00.000Z",
    gatePolicy: { maximumLatencyRegressionRatio: 1_000_000_000 },
  });
}

export function withFailedPromotionGates(
  comparison: AgentCandidateEvaluationArtifact,
): AgentCandidateEvaluationArtifact {
  const failed = structuredClone(comparison);
  failed.gates = {
    ...failed.gates,
    passed: false,
    results: failed.gates.results.map((result) =>
      result.gateId === "improvement"
        ? { ...result, status: "failed" as const, message: "No improvement." }
        : result
    ),
  };
  return failed;
}
