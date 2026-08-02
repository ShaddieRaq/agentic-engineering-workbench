import type { AgentRunResult } from "../../src/agents/agentRunResult.js";
import type { AgentDatasetRunResult } from "../../src/agents/datasets/agentDatasetRunner.js";
import type { AgentVerificationResult } from "../../src/agents/agentVerification.js";

const manifest: AgentRunResult["manifest"] = {
  id: "evaluation-agent",
  name: "Evaluation Agent",
  version: "1.0.0",
  status: "active",
  description: "Produces evaluation fixtures.",
  owner: "tests",
  tags: ["test"],
  defaultModel: "fake-model",
  components: { workflowIds: [], harnessIds: [], scenarioIds: [], datasetIds: ["evaluation-dataset"] },
  permissions: { toolIds: [] },
  verification: { datasetIds: ["evaluation-dataset"], minimumPassRate: 1 },
};

export function evaluationAgentRun(id: string, succeeded: boolean): AgentRunResult {
  return {
    agentRunId: id,
    agentId: manifest.id,
    agentVersion: manifest.version,
    manifestDigest: "a".repeat(64),
    manifest,
    input: { failureLog: "Timeout waiting for checkout." },
    configuration: { model: "fake-model", permittedToolIds: [], workspaceId: "fixture-workspace" },
    warnings: [],
    output: { classification: succeeded ? "test-defect" : "application-defect" },
    assessment: { passed: succeeded, message: succeeded ? "Classification matched." : "Classification did not match." },
    failure: null,
    succeeded,
    durationMs: succeeded ? 10 : 12,
    completedAt: "2026-08-02T12:00:00.000Z",
  };
}

export function evaluationDatasetRun(
  id: string,
  outcomes: boolean[],
): AgentDatasetRunResult {
  const runs = outcomes.map((outcome, index) => ({
    datasetCaseId: "checkout-timeout",
    agentRun: evaluationAgentRun(`${id}-run-${index + 1}`, outcome),
  }));
  const passedRuns = outcomes.filter(Boolean).length;
  return {
    datasetRunId: id,
    datasetId: "evaluation-dataset",
    agentId: manifest.id,
    agentVersion: manifest.version,
    runs,
    caseSummaries: [{
      datasetCaseId: "checkout-timeout",
      totalRuns: outcomes.length,
      passedRuns,
      failedRuns: outcomes.length - passedRuns,
      passRate: outcomes.length === 0 ? null : passedRuns / outcomes.length,
    }],
    completedAt: "2026-08-02T12:00:01.000Z",
  };
}

export function evaluationVerification(
  datasetRun: AgentDatasetRunResult,
): AgentVerificationResult {
  const failedCaseIds = datasetRun.caseSummaries
    .filter(({ passRate }) => passRate !== 1)
    .map(({ datasetCaseId }) => datasetCaseId);
  return {
    agentId: datasetRun.agentId,
    agentVersion: datasetRun.agentVersion,
    datasetId: datasetRun.datasetId,
    minimumPassRate: 1,
    passed: failedCaseIds.length === 0,
    failedCaseIds,
  };
}
