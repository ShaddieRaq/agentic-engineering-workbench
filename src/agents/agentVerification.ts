import type { AgentManifest } from "./agentManifest.js";
import type { AgentDatasetRunResult } from "./datasets/agentDatasetRunner.js";

export interface AgentVerificationResult {
  agentId: string;
  agentVersion: string;
  datasetId: string;
  minimumPassRate: number | null;
  passed: boolean;
  failedCaseIds: string[];
}

export function verifyAgentDataset(
  manifest: AgentManifest,
  datasetRun: AgentDatasetRunResult,
): AgentVerificationResult {
  if (manifest.id !== datasetRun.agentId) {
    throw new Error(
      `Dataset result belongs to ${datasetRun.agentId}, not ${manifest.id}.`,
    );
  }

  if (manifest.version !== datasetRun.agentVersion) {
    throw new Error(
      `Dataset result belongs to agent version ${datasetRun.agentVersion}, not ${manifest.version}.`,
    );
  }

  const threshold = manifest.verification.minimumPassRate;
  const failedCaseIds = threshold === null
    ? []
    : datasetRun.caseSummaries
        .filter(({ passRate }) => passRate === null || passRate < threshold)
        .map(({ datasetCaseId }) => datasetCaseId);

  return {
    agentId: manifest.id,
    agentVersion: manifest.version,
    datasetId: datasetRun.datasetId,
    minimumPassRate: threshold,
    passed: threshold !== null && failedCaseIds.length === 0,
    failedCaseIds,
  };
}
