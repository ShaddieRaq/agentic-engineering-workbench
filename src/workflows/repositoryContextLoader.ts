import type {
  ReadFileInput,
  ReadFileOutput,
} from "../tools/readFileTool.js";
import type { ToolDefinition } from "../tools/toolDefinition.js";
import {
  executeTool,
  type ToolCallEvidence,
  type ToolFailure,
} from "../tools/toolExecutor.js";
import type {
  RepositoryContextCandidate,
  RepositoryContextSelection,
} from "./repositoryContextSelector.js";

export interface LoadedRepositoryContextItem {
  id: string;
  source: string;
  toolCallId: string;
  sizeBytes: number;
  priority: number;
  rationale: string;
}

export interface RepositoryContextRead {
  candidate: RepositoryContextCandidate;
  evidence: ToolCallEvidence<ReadFileOutput>;
}

export interface RejectedRepositoryContextCandidate {
  candidate: RepositoryContextCandidate;
  reason: "budget-exhausted" | "read-failed";
  failure: ToolFailure | null;
}

export interface RepositoryContextAssembly {
  maximumBytes: number;
  totalBytes: number;
  items: LoadedRepositoryContextItem[];
  reads: RepositoryContextRead[];
  rejectedCandidates: RejectedRepositoryContextCandidate[];
  complete: boolean;
}

export async function loadRepositoryContext(
  selection: RepositoryContextSelection,
  readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput>,
  maximumBytes = 65_536,
): Promise<RepositoryContextAssembly> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive integer.");
  }

  const items: LoadedRepositoryContextItem[] = [];
  const reads: RepositoryContextRead[] = [];
  const rejectedCandidates: RejectedRepositoryContextCandidate[] = [];
  let totalBytes = 0;

  for (const candidate of selection.candidates) {
    const remainingBytes = maximumBytes - totalBytes;

    if (remainingBytes === 0) {
      rejectedCandidates.push({
        candidate,
        reason: "budget-exhausted",
        failure: null,
      });
      continue;
    }

    const evidence = await executeTool(readFileTool, {
      path: candidate.path,
      maxBytes: 32_768,
    });
    reads.push({ candidate, evidence });

    if (!evidence.succeeded || evidence.output === null) {
      rejectedCandidates.push({
        candidate,
        reason: "read-failed",
        failure: evidence.failure,
      });
      continue;
    }

    if (evidence.output.sizeBytes > remainingBytes) {
      rejectedCandidates.push({
        candidate,
        reason: "budget-exhausted",
        failure: null,
      });
      continue;
    }

    items.push({
      id: `repository:${candidate.path}`,
      source: candidate.path,
      toolCallId: evidence.toolCallId,
      sizeBytes: evidence.output.sizeBytes,
      priority: candidate.priority,
      rationale: candidate.rationale,
    });
    totalBytes += evidence.output.sizeBytes;
  }

  return {
    maximumBytes,
    totalBytes,
    items,
    reads,
    rejectedCandidates,
    complete: selection.complete && rejectedCandidates.length === 0,
  };
}
