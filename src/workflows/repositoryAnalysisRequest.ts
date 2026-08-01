import type { AIProviderRequest } from "../providers/aiProvider.js";
import type { ReadFileOutput } from "../tools/readFileTool.js";
import type { ToolCallEvidence } from "../tools/toolExecutor.js";
import type { RepositoryContextAssembly } from "./repositoryContextLoader.js";
import {
  repositoryAnalysisOutputSchema,
  type RepositoryAnalysisOutput,
} from "./repositoryAnalysisOutput.js";

const defaultInstruction = [
  "Analyze this repository for an engineer who must work in it.",
  "Explain the architecture, identify executable entry points and concrete risks,",
  "and recommend tests that would provide useful confidence.",
].join(" ");

function readEvidenceById(
  assembly: RepositoryContextAssembly,
): Map<string, ToolCallEvidence<ReadFileOutput>> {
  return new Map(
    assembly.reads.map(({ evidence }) => [evidence.toolCallId, evidence]),
  );
}

export function buildRepositoryAnalysisRequest(
  assembly: RepositoryContextAssembly,
  instruction = defaultInstruction,
): AIProviderRequest<RepositoryAnalysisOutput> {
  if (instruction.trim().length === 0) {
    throw new Error("Repository analysis instruction must not be empty.");
  }

  if (assembly.items.length === 0) {
    throw new Error("Repository analysis requires at least one context item.");
  }

  const evidenceById = readEvidenceById(assembly);
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

  return {
    prompt: [
      "ROLE:",
      "You are a repository analysis assistant.",
      "Use only the supplied context. Do not claim that unobserved files or behavior exist.",
      "Every architecture component, entry point, risk, and test recommendation must cite exact Source paths.",
      "",
      `Context completeness: ${assembly.complete ? "complete" : "incomplete"}`,
      `Context bytes: ${assembly.totalBytes}/${assembly.maximumBytes}`,
      "Rejected candidates:",
      rejectedSummary,
      "",
      "CONTEXT FILES:",
      contextSections.join("\n\n---\n\n"),
      "",
      "TASK:",
      instruction.trim(),
    ].join("\n"),
    outputSchema: repositoryAnalysisOutputSchema,
  };
}
