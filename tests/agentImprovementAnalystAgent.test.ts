import { describe, expect, it } from "vitest";
import type { AIProvider } from "../src/providers/aiProvider.js";
import { runAgent } from "../src/agents/agentRunner.js";
import { platformAgentRegistry } from "../src/agents/platformAgentRegistry.js";
import { getAgentDatasetDefinition } from "../src/agents/datasets/agentDatasetRegistry.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { AgentImprovementProposalOutput } from "../src/agents/agentImprovement/agentImprovementProposal.js";

function proposal(): AgentImprovementProposalOutput {
  return {
    disposition: "engineering-change-required",
    summary: "The subject instructions do not require claim-level citations.",
    failureModes: [
      {
        title: "Incomplete grounding",
        explanation: "Both supplied trials omitted required citations.",
        confidence: "high",
        evidenceIds: ["case:documentation-grounding"],
      },
    ],
    rootCauseHypotheses: [
      {
        title: "Underspecified evidence instructions",
        explanation: "The repeated behavior is consistent with an instruction gap.",
        confidence: "medium",
        evidenceIds: ["case:documentation-grounding"],
      },
    ],
    recommendations: [
      {
        category: "instructions",
        title: "Require claim-level citations",
        rationale: "The repeated failure is specific to grounding behavior.",
        proposedChange: "Require every conclusion to cite an exact supplied evidence ID.",
        priority: "high",
        evidenceIds: ["case:documentation-grounding"],
      },
    ],
    candidatePolicyPatch: null,
    suggestedEvaluationCases: [],
    expectedEffects: [
      {
        metric: "grounding",
        direction: "improve",
        explanation: "The desired behavior becomes explicit.",
      },
    ],
    risks: [
      {
        risk: "The diagnosis is based on a small controlled sample.",
        mitigation: "Use repeated development and protected cases before promotion.",
      },
    ],
    evidenceGaps: ["The subject exposes no candidate revision surface."],
    verificationPlan: {
      successCriteria: ["The failed grounding case passes repeatedly."],
      protectedRequirements: ["No protected case regresses."],
      recommendedRepetitions: 3,
    },
  };
}

describe("agentImprovementAnalystAgent", () => {
  it("registers as a read-only agent with cross-agent verification", () => {
    const registration = platformAgentRegistry.get("agent-improvement-analyst");
    const dataset = getAgentDatasetDefinition(
      "agent-improvement-analyst-smoke",
    );

    expect(registration.manifest).toMatchObject({
      version: "0.2.0",
      status: "experimental",
      permissions: { toolIds: [] },
      verification: {
        datasetIds: ["agent-improvement-analyst-smoke"],
        minimumPassRate: 1,
      },
    });
    expect(dataset.cases.map(({ input }) => (input as { subject: { agentId: string } }).subject.agentId)).toEqual([
      "documentation-auditor",
      "repository-assistant",
      "change-risk-reviewer",
      "tool-builder",
      "playwright-failure-triage",
    ]);
    expect(dataset.cases.every(({ expected }) => expected !== undefined)).toBe(true);
  });

  it("runs through the shared agent runner without tools", async () => {
    const dataset = getAgentDatasetDefinition(
      "agent-improvement-analyst-smoke",
    );
    const provider: AIProvider = {
      async generate<TOutput>() {
        return {
          rawOutput: "structured improvement analysis",
          parsedOutput: proposal() as TOutput,
          refusal: null,
          provider: { model: "fake-improvement-model", usage: null },
        };
      },
    };

    const result = await runAgent(
      "agent-improvement-analyst",
      dataset.cases[0]!.input,
      {
        agents: platformAgentRegistry,
        tools: new ToolRegistry([]),
        provider,
        workspaceRoot: "/workspace",
      },
    );

    expect(result).toMatchObject({
      agentId: "agent-improvement-analyst",
      succeeded: true,
      configuration: { permittedToolIds: [] },
      assessment: {
        passed: true,
        message: "Improvement analysis completed with grounded policy evidence.",
      },
      output: {
        subjectAgentId: "documentation-auditor",
        disposition: "engineering-change-required",
        recommendationCategories: ["instructions"],
        hasCandidatePolicyPatch: false,
        policyEvaluation: { passed: true },
      },
    });
  });

  it("assesses the expected failure category for each subject family", () => {
    const registration = platformAgentRegistry.get("agent-improvement-analyst");
    const dataset = getAgentDatasetDefinition(
      "agent-improvement-analyst-smoke",
    );

    for (const datasetCase of dataset.cases) {
      const expected = datasetCase.expected as {
        disposition: "candidate-ready" | "engineering-change-required" | "evaluation-gap" | "insufficient-evidence" | "no-change";
        requiredRecommendationCategories: Array<
          "instructions" | "context-policy" | "workflow-policy" | "model-policy" | "tool-capability" | "output-contract" | "evaluator" | "dataset" | "implementation" | "no-change"
        >;
        hasCandidatePolicyPatch: boolean;
      };
      const assessment = registration.assessDatasetCase!(
        datasetCase.input,
        {
          analysisRunId: "analysis-1",
          succeeded: true,
          subjectAgentId: (datasetCase.input as { subject: { agentId: string } }).subject.agentId,
          disposition: expected.disposition,
          summary: "Controlled expected output.",
          recommendationCategories: expected.requiredRecommendationCategories,
          hasCandidatePolicyPatch: expected.hasCandidatePolicyPatch,
          policyEvaluation: {
            passed: true,
            citedEvidenceIds: [],
            invalidEvidenceIds: [],
            issues: [],
            message: "Grounded.",
          },
          analysisEvidence: {},
        },
        datasetCase.expected,
      );

      expect(assessment, datasetCase.id).toMatchObject({ passed: true });
    }
  });
});
