import {
  createAgentCandidateEvaluationArtifact,
  type AgentCandidateEvaluationArtifact,
} from "../agents/evaluations/agentCandidateEvaluationArtifact.js";
import type {
  AgentCandidateEvaluationExecution,
} from "../agents/evaluations/agentCandidateEvaluationRunner.js";
import type {
  ArtifactReference,
  ArtifactStore,
} from "./artifactStore.js";

export interface PersistedAgentCandidateEvaluation {
  artifact: AgentCandidateEvaluationArtifact;
  reference: ArtifactReference;
  baselineEvaluationReference: ArtifactReference;
  candidateEvaluationReference: ArtifactReference;
  datasetRunReferences: ArtifactReference[];
}

export async function persistAgentCandidateEvaluation(
  store: ArtifactStore,
  execution: AgentCandidateEvaluationExecution,
  options: {
    candidateEvaluationId?: string;
    completedAt?: string;
  } = {},
): Promise<PersistedAgentCandidateEvaluation> {
  const datasetRunReferences: ArtifactReference[] = [];
  for (const datasetRun of [
    ...execution.baseline.datasetRuns,
    ...execution.candidate.datasetRuns,
  ]) {
    datasetRunReferences.push(await store.saveAgentDatasetRun(datasetRun));
  }

  const baselineEvaluationReference = await store.saveAgentEvaluation(
    execution.baseline.experiment,
  );
  const candidateEvaluationReference = await store.saveAgentEvaluation(
    execution.candidate.experiment,
  );
  const artifact = createAgentCandidateEvaluationArtifact(execution, options);
  const reference = await store.saveAgentCandidateEvaluation(artifact);

  return {
    artifact,
    reference,
    baselineEvaluationReference,
    candidateEvaluationReference,
    datasetRunReferences,
  };
}
