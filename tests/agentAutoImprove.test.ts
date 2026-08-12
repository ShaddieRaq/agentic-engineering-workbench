import { describe, expect, it, vi } from "vitest";
import type {
  AgentCandidateEvaluationEvidence,
  AgentImprovementEvidence,
} from "../src/agents/agentApplicationService.js";
import type { TriagedCase } from "../src/agents/modelMatrix/agentModelMatrixTriage.js";
import { runAutoImprove } from "../src/agents/autoImprove/agentAutoImprove.js";

function ambiguityCase(caseId: string, marginal = false): TriagedCase {
  return {
    datasetId: "ds",
    caseId,
    failedModels: ["gpt-5.4", "gpt-5.4-mini"],
    passedModels: [],
    classification: "ambiguity",
    worstFailurePassRate: marginal ? 0.67 : 0,
    marginal,
  };
}

function fakeAnalysis(input: {
  ready: boolean;
  disposition?: string;
  issues?: string[];
  artifactId?: string;
}): AgentImprovementEvidence {
  return {
    analysis: {
      succeeded: input.ready,
      parsedOutput: {
        disposition:
          input.disposition ??
          (input.ready ? "candidate-ready" : "engineering-change-required"),
        candidatePolicyPatch: input.ready ? { changes: [] } : null,
      },
      policyEvaluation: { passed: input.ready, issues: input.issues ?? [] },
    },
    artifactId: input.artifactId ?? "proposal-1",
    artifactPath: "runs/proposal.json",
  } as unknown as AgentImprovementEvidence;
}

function fakeComparison(input: {
  failedGateIds: string[];
  improved: number;
  regressed: number;
  id?: string;
}): AgentCandidateEvaluationEvidence {
  return {
    evaluation: {
      candidateEvaluationId: input.id ?? "candidate-1",
      gates: {
        results: ["regression", "improvement", "latency"].map((gateId) => ({
          gateId,
          status: input.failedGateIds.includes(gateId) ? "failed" : "passed",
        })),
      },
      comparison: {
        summary: {
          improvedCases: input.improved,
          regressedCases: input.regressed,
        },
      },
    },
    artifactId: input.id ?? "candidate-1",
  } as unknown as AgentCandidateEvaluationEvidence;
}

describe("runAutoImprove", () => {
  it("drives a clean candidate to 'promotable' and never records a decision", async () => {
    const analyze = vi.fn(async () => fakeAnalysis({ ready: true }));
    const evaluate = vi.fn(async () =>
      fakeComparison({ failedGateIds: [], improved: 1, regressed: 0 }),
    );

    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("vague-answer")],
      analyze,
      evaluate,
    });

    expect(result.attempts).toHaveLength(1);
    const attempt = result.attempts[0]!;
    expect(attempt.outcome).toBe("promotable");
    expect(attempt.passedAllGates).toBe(true);
    expect(attempt.candidateEvaluationId).toBe("candidate-1");
    expect(attempt.analystAttempts).toBe(1);
  });

  it("reports 'gate-rejected' when the comparison fails a gate", async () => {
    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("vague-answer")],
      analyze: async () => fakeAnalysis({ ready: true }),
      evaluate: async () =>
        fakeComparison({ failedGateIds: ["regression"], improved: 1, regressed: 1 }),
    });

    const attempt = result.attempts[0]!;
    expect(attempt.outcome).toBe("gate-rejected");
    expect(attempt.failedGateIds).toEqual(["regression"]);
    expect(attempt.regressedCases).toBe(1);
  });

  it("retries the analyst up to the bound and skips the comparison when it never goes policy-valid", async () => {
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls++;
      return fakeAnalysis({
        ready: false,
        issues: ["Proposal cites unavailable evidence: revisionSurface."],
      });
    });
    const evaluate = vi.fn();

    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("hard")],
      analyze,
      evaluate,
      maxAnalystAttempts: 3,
    });

    const attempt = result.attempts[0]!;
    expect(attempt.outcome).toBe("analyst-failed");
    expect(attempt.analystAttempts).toBe(3);
    expect(calls).toBe(3);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("recovers when the analyst goes policy-valid on a retry", async () => {
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls++;
      return calls < 2
        ? fakeAnalysis({ ready: false, issues: ["cite only case:/trial: ids"] })
        : fakeAnalysis({ ready: true });
    });

    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("vague-answer")],
      analyze,
      evaluate: async () =>
        fakeComparison({ failedGateIds: [], improved: 1, regressed: 0 }),
    });

    const attempt = result.attempts[0]!;
    expect(attempt.analystAttempts).toBe(2);
    expect(attempt.outcome).toBe("promotable");
  });

  it("skips marginal ambiguity cases without calling the analyst", async () => {
    const analyze = vi.fn(async () => fakeAnalysis({ ready: true }));
    const evaluate = vi.fn();

    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("flaky", true)],
      analyze,
      evaluate,
    });

    expect(result.solidAmbiguityCases).toBe(0);
    expect(result.marginalSkipped).toBe(1);
    expect(result.attempts).toHaveLength(0);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("caps the number of cases attempted at maxCases", async () => {
    const result = await runAutoImprove({
      agentId: "project-intake",
      sourceExperimentId: "exp-1",
      ambiguity: [ambiguityCase("a"), ambiguityCase("b")],
      analyze: async () => fakeAnalysis({ ready: true }),
      evaluate: async () =>
        fakeComparison({ failedGateIds: [], improved: 1, regressed: 0 }),
      maxCases: 1,
    });

    expect(result.attempts).toHaveLength(1);
  });
});
