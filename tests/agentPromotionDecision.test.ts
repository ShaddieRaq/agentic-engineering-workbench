import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAgentPromotionDecision,
} from "../src/agents/evaluations/agentPromotionDecision.js";
import { FileArtifactStore } from "../src/artifacts/fileArtifactStore.js";
import { presentArtifact } from "../src/presentation/artifactPresenter.js";
import {
  createPassingCandidateComparison,
  withFailedPromotionGates,
} from "./helpers/candidateComparisonFixture.js";

describe("createAgentPromotionDecision", () => {
  it("approves only when gates passed and emits a release task", async () => {
    const comparison = await createPassingCandidateComparison();
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

    const failedComparison = withFailedPromotionGates(comparison);
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
    const comparison = await createPassingCandidateComparison();
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
    const comparison = await createPassingCandidateComparison();
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
