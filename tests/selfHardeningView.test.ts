import { describe, expect, it } from "vitest";
import type { ArtifactStore, StoredArtifact } from "../src/artifacts/artifactStore.js";
import {
  buildSelfHardeningCycle,
  buildSelfHardeningIndex,
} from "../src/web/selfHardeningView.js";

function decision(overrides: Record<string, unknown>): StoredArtifact {
  return {
    kind: "agent-promotion-decision",
    artifact: {
      decisionId: "d",
      decision: "approve",
      candidateEvaluationArtifactId: "c",
      proposalArtifactId: "p",
      subject: { agentId: "project-intake", agentVersion: "0.6.0", manifestDigest: "x" },
      candidate: {},
      gatesPassed: true,
      operatorId: "claude-delegated-by-rashad",
      rationale: "All gates passed; two cases improved.",
      releaseTask: { requiredActions: ["Apply the patch verbatim", "Bump version"] },
      decidedAt: "2026-08-12T00:00:00.000Z",
      ...overrides,
    },
  } as unknown as StoredArtifact;
}

const PROPOSAL: StoredArtifact = {
  kind: "agent-improvement-proposal",
  artifact: {
    packet: { execution: { model: "gpt-5.4", repetitions: 3 } },
    parsedOutput: {
      disposition: "candidate-ready",
      candidatePolicyPatch: { changes: [{ field: "questionRules", valueJson: "\"x\"" }] },
      recommendations: [{ title: "one" }, { title: "two" }],
    },
    policyEvaluation: { passed: true, message: "valid" },
  },
} as unknown as StoredArtifact;

const CANDIDATE: StoredArtifact = {
  kind: "agent-candidate-evaluation",
  artifact: {
    comparison: {
      summary: { improvedCases: 2, regressedCases: 0, unchangedCases: 5, insufficientEvidenceCases: 0 },
    },
    gates: {
      passed: true,
      results: [
        { gateId: "no-regression", status: "passed", message: "no case regressed" },
        { gateId: "improvement", status: "passed", message: "2 improved" },
      ],
    },
  },
} as unknown as StoredArtifact;

function fakeStore(artifacts: Record<string, StoredArtifact>): Pick<ArtifactStore, "list" | "load"> {
  return {
    async list(query) {
      const entries = Object.entries(artifacts).filter(
        ([, stored]) => !query?.kind || stored.kind === query.kind,
      );
      return {
        artifacts: entries.map(([id, stored]) => ({
          id,
          kind: stored.kind,
          path: `${id}.json`,
          agentId: "project-intake",
          agentVersion: "0.6.0",
          workspaceId: null,
          completedAt: "2026-08-12T00:00:00.000Z",
          succeeded: null,
        })),
        rejected: [],
      };
    },
    async load(id) {
      const stored = artifacts[id];
      if (!stored) throw new Error(`unknown artifact ${id}`);
      return stored;
    },
  };
}

describe("self-hardening view-model", () => {
  it("assembles the cycle from a promotion decision, proposal, and candidate", async () => {
    const store = fakeStore({ d: decision({}), p: PROPOSAL, c: CANDIDATE });
    const cycle = await buildSelfHardeningCycle(store, "d");
    if (!cycle) throw new Error("expected a cycle");

    expect(cycle.decision).toBe("approve");
    expect(cycle.released).toBe(true);
    expect(cycle.releaseActions).toHaveLength(2);
    expect(cycle.subjectAgentId).toBe("project-intake");

    expect(cycle.signal?.disposition).toBe("candidate-ready");
    expect(cycle.signal?.recommendationCount).toBe(2);
    expect(cycle.signal?.hasPolicyPatch).toBe(true);
    expect(cycle.signal?.policyValid).toBe(true);

    expect(cycle.comparison?.improvedCases).toBe(2);
    expect(cycle.comparison?.gatesPassed).toBe(true);
    expect(cycle.comparison?.gates).toHaveLength(2);
  });

  it("stands when the proposal is missing and no release task exists", async () => {
    const store = fakeStore({
      d: decision({ decision: "reject", gatesPassed: false, releaseTask: null }),
      c: CANDIDATE,
    });
    const cycle = await buildSelfHardeningCycle(store, "d");
    if (!cycle) throw new Error("expected a cycle");

    expect(cycle.decision).toBe("reject");
    expect(cycle.released).toBe(false);
    expect(cycle.releaseActions).toHaveLength(0);
    // Proposal id "p" is not in the store → signal is null, cycle still renders.
    expect(cycle.signal).toBeNull();
    expect(cycle.comparison).not.toBeNull();
  });

  it("returns null for an unknown decision id", async () => {
    const store = fakeStore({ d: decision({}) });
    expect(await buildSelfHardeningCycle(store, "nope")).toBeNull();
  });

  it("indexes cycles newest-disposition-first with a released flag", async () => {
    const store = fakeStore({
      older: decision({ decisionId: "older", decidedAt: "2026-08-10T00:00:00.000Z", decision: "reject", gatesPassed: false, releaseTask: null }),
      newer: decision({ decisionId: "newer", decidedAt: "2026-08-12T00:00:00.000Z" }),
    });
    const index = await buildSelfHardeningIndex(store);
    expect(index.cycles.map((cycle) => cycle.decisionId)).toEqual(["newer", "older"]);
    expect(index.cycles[0]!.released).toBe(true);
    expect(index.cycles[1]!.released).toBe(false);
  });
});
