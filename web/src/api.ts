export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  status: "experimental" | "active" | "deprecated" | "retired";
  description: string;
  owner: string;
  tags: string[];
  defaultModel: string;
  components: {
    workflowIds: string[];
    harnessIds: string[];
    scenarioIds: string[];
    datasetIds: string[];
  };
  permissions: { toolIds: string[] };
  verification: { datasetIds: string[]; minimumPassRate: number | null };
}

export interface Health {
  status: string;
  apiKeyConfigured: boolean;
  workspaceRoot: string;
  catalogValid: boolean;
}

export interface AgentDescription {
  manifest: AgentManifest;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  required?: string[];
  enum?: unknown[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ArtifactSummary {
  id: string;
  kind:
    | "agent-run"
    | "agent-dataset-run"
    | "agent-evaluation"
    | "agent-candidate-evaluation"
    | "agent-improvement-proposal"
    | "agent-promotion-decision";
  path: string;
  agentId: string;
  agentVersion: string;
  workspaceId: string | null;
  completedAt: string;
  succeeded: boolean | null;
}

export interface WorkspaceDefinition {
  id: string;
  name: string;
  rootPath: string;
  addedAt: string;
  builtIn: boolean;
}

export interface ToolSummary {
  id: string;
  description: string;
  consumerAgentIds: string[];
}

export interface ToolDescription extends ToolSummary {
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface ArtifactList {
  artifacts: ArtifactSummary[];
  rejected: Array<{ path: string; reason: string }>;
}

export interface OperationEvent {
  sequence: number;
  stage: string;
  message: string;
  occurredAt: string;
}

export interface Operation {
  operationId: string;
  kind:
    | "agent-run"
    | "agent-verification"
    | "agent-improvement"
    | "agent-candidate-evaluation";
  agentId: string;
  status: "queued" | "running" | "completed" | "failed";
  events: OperationEvent[];
  result: unknown | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface VerificationEvidence {
  artifactId: string;
  artifactPath: string;
  verification: {
    agentId: string;
    agentVersion: string;
    datasetId: string;
    minimumPassRate: number | null;
    passed: boolean;
    failedCaseIds: string[];
  };
}

export interface EvaluationExperiment {
  experimentId: string;
  agentId: string;
  agentVersion: string;
  workspaceId: string;
  model: string;
  execution: { repetitions: number; concurrency: number };
  datasets: Array<{
    datasetId: string;
    datasetRunArtifactId: string;
    verification: VerificationEvidence["verification"];
    totalCases: number;
    passedCases: number;
    failedCases: number;
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number | null;
  }>;
  summary: {
    totalDatasets: number;
    passedDatasets: number;
    failedDatasets: number;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number | null;
  };
  passed: boolean;
  completedAt: string;
}

export interface EvaluationList {
  experiments: EvaluationExperiment[];
  rejected: Array<{ path: string; reason: string }>;
}

export interface EvaluationTrial {
  agentRunId: string;
  succeeded: boolean;
  runtimeSucceeded: boolean;
  input: unknown;
  output: unknown | null;
  assessment: { passed: boolean; message: string } | null;
  caseAssessment: { passed: boolean; message: string } | null;
  failure: { stage: string; category: string; message: string } | null;
  durationMs: number;
  completedAt: string;
}

export interface EvaluationCase {
  datasetId: string;
  datasetCaseId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
  minimumPassRate: number | null;
  passed: boolean;
  input: unknown;
  expectation: unknown | null;
  trials: EvaluationTrial[];
}

export interface EvaluationView {
  experiment: EvaluationExperiment;
  datasets: Array<{
    datasetId: string;
    passed: boolean;
    minimumPassRate: number | null;
    cases: EvaluationCase[];
  }>;
}

export interface EvaluationComparison {
  baseline: Pick<EvaluationExperiment, "experimentId" | "agentId" | "agentVersion" | "model" | "completedAt">;
  candidate: Pick<EvaluationExperiment, "experimentId" | "agentId" | "agentVersion" | "model" | "completedAt">;
  summary: {
    improvedCases: number;
    regressedCases: number;
    unchangedCases: number;
    insufficientEvidenceCases: number;
  };
  cases: Array<{
    datasetId: string;
    datasetCaseId: string;
    baselinePassRate: number | null;
    candidatePassRate: number | null;
    passRateDelta: number | null;
    classification: "improved" | "regressed" | "unchanged" | "insufficient-evidence";
  }>;
}

export interface AgentEvaluationEvidence {
  experiment: EvaluationExperiment;
  datasets: VerificationEvidence[];
  artifactId: string;
  artifactPath: string;
}

export interface ArtifactPresentation {
  artifactId: string;
  artifactKind:
    | "agent-run"
    | "agent-dataset-run"
    | "agent-evaluation"
    | "agent-candidate-evaluation"
    | "agent-improvement-proposal"
    | "agent-promotion-decision";
  presentationKind:
    | "generic"
    | "documentation-audit"
    | "playwright-failure-triage"
    | "agent-improvement";
  title: string;
  agentId: string;
  agentVersion: string;
  workspaceId: string | null;
  succeeded: boolean | null;
  assessment: string | null;
  overview: string | null;
  completedAt: string;
  durationMs: number | null;
  metrics: Array<{ id: string; label: string; value: string; detail: string | null }>;
  findings: Array<{
    title: string;
    category: "stale" | "missing" | "inconsistent" | "accurate" | "test-defect" | "application-defect" | "environment" | "test-data" | "infrastructure" | "product-change" | "unknown";
    severity: "low" | "medium" | "high";
    explanation: string;
    evidencePaths: string[];
    recommendation: string;
  }>;
  coverageGaps: Array<{ area: string; reason: string; evidencePaths: string[] }>;
  prioritizedActions: string[];
  sources: Array<{ path: string; sizeBytes: number; rationale: string; toolCallId: string }>;
  timeline: Array<{
    id: string;
    label: string;
    status: "completed" | "warning" | "failed" | "skipped";
    detail: string;
    durationMs: number | null;
  }>;
  usage: {
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
    pricingIds: string[];
  } | null;
  warnings: string[];
  improvement: {
    sourceExperimentIds: string[];
    evidenceItemCount: number;
    excludedEvidenceCount: number;
    proposal: {
      disposition: string;
      summary: string;
      failureModes: Array<{
        title: string;
        explanation: string;
        confidence: "low" | "medium" | "high";
        evidenceIds: string[];
      }>;
      recommendations: Array<{
        category: string;
        title: string;
        rationale: string;
        proposedChange: string;
        priority: "low" | "medium" | "high";
        evidenceIds: string[];
      }>;
      candidatePolicyPatch: {
        changes: Array<{ field: string; valueJson: string }>;
      } | null;
      evidenceGaps: string[];
      verificationPlan: {
        successCriteria: string[];
        protectedRequirements: string[];
        recommendedRepetitions: number;
      };
      [key: string]: unknown;
    } | null;
    policyEvaluation: {
      passed: boolean;
      citedEvidenceIds: string[];
      invalidEvidenceIds: string[];
      issues: string[];
      message: string;
    } | null;
  } | null;
}

export interface ArtifactSourceSnapshot {
  path: string;
  content: string;
  sizeBytes: number;
  rationale: string;
  toolCallId: string;
}

export type PromotionDecisionKind = "approve" | "reject" | "revise";

export interface CandidateEvaluationArtifact {
  candidateEvaluationId: string;
  plan: {
    planId: string;
    subject: { agentId: string; agentVersion: string };
    candidate: { candidateId: string; proposalId: string };
  };
  comparison: {
    summary: {
      improvedCases: number;
      regressedCases: number;
      unchangedCases: number;
      insufficientEvidenceCases: number;
    };
  };
  gates: {
    passed: boolean;
    results: Array<{
      gateId: string;
      status: "passed" | "failed" | "not-applicable";
      message: string;
    }>;
  };
  completedAt: string;
}

export interface ImprovementProposalArtifact {
  analysisRunId: string;
  succeeded: boolean;
  packet: {
    subject: { agentId: string; agentVersion: string };
    execution: {
      workspaceId: string;
      model: string;
      repetitions: number;
      concurrency: number;
    };
  };
  parsedOutput: {
    disposition:
      | "candidate-ready"
      | "engineering-change-required"
      | "evaluation-gap"
      | "insufficient-evidence"
      | "no-change";
    candidatePolicyPatch: {
      changes: Array<{ field: string; valueJson: string }>;
    } | null;
    recommendations: Array<{
      category:
        | "instructions"
        | "context-policy"
        | "workflow-policy"
        | "model-policy"
        | "tool-capability"
        | "output-contract"
        | "evaluator"
        | "dataset"
        | "implementation"
        | "no-change";
      title: string;
      rationale: string;
      proposedChange: string;
      priority: "low" | "medium" | "high";
      evidenceIds: string[];
    }>;
  } | null;
  policyEvaluation: { passed: boolean; message: string } | null;
}

export interface PromotionDecisionEvidence {
  decision: {
    decisionId: string;
    decision: PromotionDecisionKind;
    candidateEvaluationArtifactId: string;
    proposalArtifactId: string | null;
    gatesPassed: boolean;
    operatorId: string;
    rationale: string;
    releaseTask: {
      kind: "source-controlled-agent-release";
      subjectAgentId: string;
      baseVersion: string;
      candidateId: string;
      proposalId: string;
      effectivePolicyDigest: string;
      requiredActions: string[];
    } | null;
    decidedAt: string;
  };
  artifactId: string;
  artifactPath: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : undefined) as T | { error?: string } | undefined;
  if (!response.ok) {
    throw new Error((body as { error?: string } | undefined)?.error ?? `Request failed: ${response.status}`);
  }
  return body as T;
}
