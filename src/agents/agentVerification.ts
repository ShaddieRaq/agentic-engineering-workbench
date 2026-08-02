import { z } from "zod";
import type { AgentManifest } from "./agentManifest.js";
import type { AgentDatasetRunResult } from "./datasets/agentDatasetRunner.js";

export const agentVerificationResultSchema = z.object({
  agentId: z.string().min(1),
  agentVersion: z.string().min(1),
  datasetId: z.string().min(1),
  minimumPassRate: z.number().min(0).max(1).nullable(),
  passed: z.boolean(),
  failedCaseIds: z.array(z.string().min(1)),
}).strict();

export type AgentVerificationResult = z.infer<
  typeof agentVerificationResultSchema
>;

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
