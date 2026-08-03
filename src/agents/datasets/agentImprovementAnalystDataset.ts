import { agentDatasetDefinitionSchema } from "./agentDatasetDefinition.js";

const manifestDigest = "a".repeat(64);

function evidencePacket(input: {
  packetId: string;
  agentId: string;
  agentVersion: string;
  description: string;
  workflowIds: string[];
  toolIds: string[];
  datasetIds: string[];
  target:
    | "reliability"
    | "correctness"
    | "grounding"
    | "cost"
    | "latency"
    | "safety"
    | "operator-defined";
  objective: string;
  constraints: string[];
  evidenceItems: Array<{
    id: string;
    kind:
      | "evaluation-summary"
      | "case-outcome"
      | "trial-output"
      | "assessment"
      | "runtime-failure"
      | "usage"
      | "operator-feedback";
    summary: string;
    details: unknown;
  }>;
}) {
  return {
    packetId: input.packetId,
    subject: {
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      manifestDigest,
      description: input.description,
      workflowIds: input.workflowIds,
      toolIds: input.toolIds,
      datasetIds: input.datasetIds,
    },
    objective: {
      target: input.target,
      description: input.objective,
      constraints: input.constraints,
    },
    sourceExperimentIds: [`${input.packetId}-experiment`],
    execution: {
      workspaceId: "synthetic-agent-improvement",
      model: "controlled-test-model",
      repetitions: 2,
      concurrency: 1,
    },
    aggregate: {
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      totalRuns: 2,
      passedRuns: 0,
      failedRuns: 2,
      passRate: 0,
    },
    evidenceItems: input.evidenceItems.map((item) => ({
      ...item,
      datasetId: input.datasetIds[0] ?? null,
      datasetCaseId: "controlled-weakness",
      agentRunId: null,
    })),
    excludedEvidence: [],
    revisionSurface: null,
  };
}

export const agentImprovementAnalystDataset =
  agentDatasetDefinitionSchema.parse({
    id: "agent-improvement-analyst-smoke",
    description:
      "Exercises improvement classification across every existing subject-agent family without exposing an executable revision surface.",
    agentId: "agent-improvement-analyst",
    purpose: "regression",
    cases: [
      {
        id: "documentation-instruction-gap",
        input: evidencePacket({
          packetId: "documentation-gap",
          agentId: "documentation-auditor",
          agentVersion: "1.0.0",
          description: "Audits repository documentation using cited evidence.",
          workflowIds: ["documentation-audit"],
          toolIds: ["file-inventory", "read-file"],
          datasetIds: ["documentation-auditor-smoke"],
          target: "grounding",
          objective: "Require every conclusion to cite supplied repository evidence.",
          constraints: ["Do not add tools or weaken citation validation."],
          evidenceItems: [
            {
              id: "case:documentation-grounding",
              kind: "case-outcome",
              summary: "Both trials contained uncited documentation conclusions.",
              details: {
                caseAssessment: "Required claim-level citations were missing.",
                runtimeSucceeded: true,
              },
            },
          ],
        }),
        expected: {
          disposition: "engineering-change-required",
          requiredRecommendationCategories: ["instructions"],
          hasCandidatePolicyPatch: false,
        },
      },
      {
        id: "repository-context-gap",
        input: evidencePacket({
          packetId: "repository-context-gap",
          agentId: "repository-assistant",
          agentVersion: "1.0.0",
          description: "Inspects, analyzes, and verifies a repository.",
          workflowIds: ["repository-assistant"],
          toolIds: [
            "inspect-git-diff",
            "inspect-package",
            "list-files",
            "read-file",
          ],
          datasetIds: ["repository-assistant-smoke"],
          target: "correctness",
          objective: "Cover high-priority changed files before orientation files.",
          constraints: ["Do not increase filesystem permissions."],
          evidenceItems: [
            {
              id: "case:missed-changed-component",
              kind: "assessment",
              summary: "The analysis missed a changed component because the context budget was consumed by lower-priority orientation files.",
              details: {
                changedFileSelected: false,
                contextBudgetExhausted: true,
              },
            },
          ],
        }),
        expected: {
          disposition: "engineering-change-required",
          requiredRecommendationCategories: ["context-policy"],
          hasCandidatePolicyPatch: false,
        },
      },
      {
        id: "change-risk-evaluator-gap",
        input: evidencePacket({
          packetId: "change-risk-evaluator-gap",
          agentId: "change-risk-reviewer",
          agentVersion: "1.0.0",
          description: "Reviews repository changes for evidence-backed risk.",
          workflowIds: ["change-risk-review"],
          toolIds: [
            "inspect-git-diff",
            "inspect-package",
            "list-files",
            "read-file",
          ],
          datasetIds: ["change-risk-reviewer-smoke"],
          target: "correctness",
          objective: "Detect materially understated release risk.",
          constraints: ["Do not change the subject behavior and grader together."],
          evidenceItems: [
            {
              id: "assessment:structured-only",
              kind: "assessment",
              summary: "The registered assessment passed every schema-valid review without checking the reviewed risk classification.",
              details: { assessment: "runtime-success-only" },
            },
            {
              id: "feedback:understated-risk",
              kind: "operator-feedback",
              summary: "Independent review confirmed that a high-risk authentication change was classified as low risk.",
              details: { confirmedClassification: "high", observedClassification: "low" },
            },
          ],
        }),
        expected: {
          disposition: "evaluation-gap",
          requiredRecommendationCategories: ["evaluator"],
          hasCandidatePolicyPatch: false,
        },
      },
      {
        id: "tool-builder-capability-gap",
        input: evidencePacket({
          packetId: "tool-builder-capability-gap",
          agentId: "tool-builder",
          agentVersion: "0.1.0",
          description: "Creates reviewable bounded tool implementation proposals.",
          workflowIds: ["tool-proposal"],
          toolIds: [],
          datasetIds: ["tool-builder-smoke"],
          target: "reliability",
          objective: "Verify that proposed TypeScript compiles before promotion.",
          constraints: ["Do not give Tool Builder shell or write access."],
          evidenceItems: [
            {
              id: "case:uncompiled-proposal",
              kind: "case-outcome",
              summary: "A policy-valid proposal contained TypeScript that did not compile when reviewed manually.",
              details: {
                proposalPolicyPassed: true,
                compilationPassed: false,
                executionCapabilityAvailable: false,
              },
            },
          ],
        }),
        expected: {
          disposition: "engineering-change-required",
          requiredRecommendationCategories: ["tool-capability"],
          hasCandidatePolicyPatch: false,
        },
      },
      {
        id: "triage-insufficient-resolution-evidence",
        input: evidencePacket({
          packetId: "triage-insufficient-evidence",
          agentId: "playwright-failure-triage",
          agentVersion: "0.1.0",
          description: "Classifies Playwright failures using bounded evidence.",
          workflowIds: ["playwright-failure-triage"],
          toolIds: ["read-file", "run-verification-command"],
          datasetIds: ["playwright-failure-triage-smoke"],
          target: "correctness",
          objective: "Determine whether the observed diagnosis justifies changing the agent.",
          constraints: ["Do not infer ground truth from the subject agent's answer."],
          evidenceItems: [
            {
              id: "trial:ambiguous-timeout",
              kind: "trial-output",
              summary: "The agent classified an ambiguous timeout as environment, but no confirmed resolution or independent classification exists.",
              details: {
                observedClassification: "environment",
                confirmedResolution: null,
                independentAssessment: null,
              },
            },
          ],
        }),
        expected: {
          disposition: "insufficient-evidence",
          requiredRecommendationCategories: ["no-change"],
          hasCandidatePolicyPatch: false,
        },
      },
    ],
  });
