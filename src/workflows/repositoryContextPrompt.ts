import type { ReadFileOutput } from "../tools/readFileTool.js";
import type { ToolCallEvidence } from "../tools/toolExecutor.js";
import type { RepositoryContextAssembly } from "./repositoryContextLoader.js";

export interface RepositoryContextPromptEvidence {
  contextSections: string[];
  rejectedSummary: string;
}

export function buildRepositoryContextPromptEvidence(
  assembly: RepositoryContextAssembly,
): RepositoryContextPromptEvidence {
  if (assembly.items.length === 0) {
    throw new Error("Repository analysis requires at least one context item.");
  }

  const evidenceById = new Map<string, ToolCallEvidence<ReadFileOutput>>(
    assembly.reads.map(({ evidence }) => [evidence.toolCallId, evidence]),
  );
  const contextSections = assembly.items.map((item) => {
    const evidence = evidenceById.get(item.toolCallId);

    if (
      evidence?.succeeded !== true ||
      evidence.output === null ||
      evidence.output.path !== item.source ||
      evidence.output.sizeBytes !== item.sizeBytes
    ) {
      throw new Error(
        `Context item ${item.source} does not reference matching successful read evidence.`,
      );
    }

    return [
      `Source: ${item.source}`,
      `Selection rationale: ${item.rationale}`,
      evidence.output.content,
    ].join("\n");
  });
  const rejectedSummary = assembly.rejectedCandidates.length === 0
    ? "None."
    : assembly.rejectedCandidates
        .map(({ candidate, reason }) => `${candidate.path}: ${reason}`)
        .join("\n");

  return { contextSections, rejectedSummary };
}
