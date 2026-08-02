import type { AgentRunResult } from "../agents/agentRunResult.js";
import type { AgentDatasetRunResult } from "../agents/datasets/agentDatasetRunner.js";

export type ArtifactKind = "agent-run" | "agent-dataset-run";

export interface ArtifactReference {
  id: string;
  kind: ArtifactKind;
  path: string;
}

export interface ArtifactSummary extends ArtifactReference {
  agentId: string;
  agentVersion: string;
  workspaceId: string | null;
  completedAt: string;
  succeeded: boolean | null;
}

export interface ArtifactQuery {
  kind?: ArtifactKind;
  agentId?: string;
  workspaceId?: string;
  succeeded?: boolean;
  limit?: number;
}

export interface RejectedArtifact {
  path: string;
  reason: string;
}

export interface ArtifactListResult {
  artifacts: ArtifactSummary[];
  rejected: RejectedArtifact[];
}

export type StoredArtifact =
  | { kind: "agent-run"; artifact: AgentRunResult }
  | { kind: "agent-dataset-run"; artifact: AgentDatasetRunResult };

export interface ArtifactStore {
  saveAgentRun(result: AgentRunResult): Promise<ArtifactReference>;
  saveAgentDatasetRun(
    result: AgentDatasetRunResult,
  ): Promise<ArtifactReference>;
  list(query?: ArtifactQuery): Promise<ArtifactListResult>;
  load(id: string): Promise<StoredArtifact>;
}
